# Security

> Part of the [Evangelina's Staycation documentation](README.md). This reflects a real audit of the current codebase (all 76 API routes individually reviewed), not a generic checklist.

- [Authentication & authorization](#authentication--authorization)
- [IDOR protection](#idor-protection)
- [WiFi/door-code reveal gate](#wifidoor-code-reveal-gate)
- [AI Concierge grounding](#ai-concierge-grounding)
- [No enumeration on guest auth endpoints](#no-enumeration-on-guest-auth-endpoints)
- [Booking-ID-only sign-in (guest hub quick-unlock)](#booking-id-only-sign-in-guest-hub-quick-unlock)
- [Input validation & injection](#input-validation--injection)
- [File upload validation](#file-upload-validation)
- [Rate limiting](#rate-limiting)
- [Security headers](#security-headers)
- [Secrets handling](#secrets-handling)
- [Known gaps](#known-gaps)
- [Google API key scope](#google-api-key-scope)

## Authentication & authorization

Two independent systems — see [Architecture.md](Architecture.md#two-separate-auth-systems). Every API route was individually checked for an auth call; the handful with none are all deliberate, by-design public endpoints (NextAuth's own handler, guest login/registration which must be reachable pre-session, the iCal export/cron which authenticate via a URL token or shared secret instead of a session, the Messenger webhook which authenticates via Meta's own verify-token handshake, and the Places photo proxy which is intentionally public since it only serves non-sensitive images). Full per-route breakdown in [API.md](API.md).

Staff routes additionally check **row-level scope**, not just role — `isUnitInScope(user, unitId)` on every unit-touching write, and `canEditSpecificBooking()` restricting a Booker to bookings they themselves logged.

## IDOR protection

Every guest-facing query is scoped by `guestId`, not by the resource id alone:
- `getGuestBookingForGuide(guestId, bookingId)` — `where: { id: bookingId, guestId }`
- `cancelGuestBooking`, `createGuestRequest`, `verifyGuestPaymentProof` — same pattern
- The WiFi/door-code reveal (below) additionally re-validates the booking's own confirmation number, not just guest ownership

Spot-checked across the full route set — no route found that trusts a client-supplied id without an ownership filter.

## WiFi/door-code reveal gate

- The server **never includes** `wifiPassword`/`doorCode` in any page payload sent to the client, even for the guest's own active booking — only a `hasWifi`/`hasDoorCode` boolean.
- Revealing the real value requires a separate `POST` (`/api/guest/wifi`, `/api/guest/door-code`), gated on the guest's session (`getCurrentGuest()`) plus [confirmation-number validity](Business-Rules.md#booking-id-confirmation-number-validity) — an expired or cancelled booking's code doesn't work even from a valid session.
- **No longer requires re-entering the booking confirmation number at reveal time.** This app previously required that as a second factor even for an already-signed-in guest, specifically because a signed-in session alone was judged insufficient for a physical access code (5 units, 5 different codes). "Guest dashboard: single auth unlocks everything" (see git log) deliberately removed that re-entry step in favor of one sign-in unlocking the whole guest dashboard. **Net effect**: if a guest's own session is left open/reused on a shared or public device, WiFi/door-code now reveal with no further confirmation — a real, currently-undocumented-elsewhere weakening versus the original design. Listed as a [known gap](#known-gaps) below rather than silently left stale.
- Rate-limited per guest.
- **The AI Concierge is bound by the same rule** — it only knows whether a code exists, never the value, and is instructed to direct the guest to these same gated pages.

## AI Concierge grounding

The Gemini system prompt (`assistantService.ts`) explicitly forbids inventing prices, dates, availability, amenities, house rules, or neighborhood places not present in the real, freshly-fetched context object — see [Integrations.md](Integrations.md#google-gemini). This is a content-accuracy control, not a strict security boundary, but it's what prevents the assistant from fabricating a confident-sounding wrong answer about pricing or availability.

## No enumeration on guest auth endpoints

- `POST /api/guest/auth/request-link` returns the identical `{ok:true}` response whether the email exists, doesn't exist, or the email send itself failed.
- `POST /api/guest/auth/verify-confirmation` returns the identical generic error whether the confirmation number doesn't exist, belongs to a different email (when one was supplied), or has expired.

## Booking-ID-only sign-in (guest hub quick-unlock)

`POST /api/guest/auth/verify-confirmation` accepts `email` as **optional** — the standalone `/guest-login` "Booking confirmation" tab still sends both and gets the original two-factor check (code must match, and if an email was sent it must match the booking's guest); the guest-hub quick-unlock card (`BookingUnlockCard.tsx`) sends **only** the confirmation number, by explicit request. This is a deliberate trade-off, not an oversight:

- **What's given up**: the second matching field (email) that previously meant a correct guess of a confirmation number alone wasn't sufficient.
- **What still protects it**: the code's own entropy (~729M combinations, EVA- + 6 chars from a 30-char alphabet) and rate limiting — now two layers instead of one: the existing per-IP limit (15/hour) plus a new **global** limit (120/hour, `guest-conf-login-global` in `rateLimit.ts`) shared across all requests regardless of source IP, since per-IP limiting alone is easy to route around with enough source addresses and this is now the only gate in front of a real door lock.
- **Why it's a reasonable trade for this business**: a handful of real bookings exist at any time (see [Performance.md](Performance.md#scale-reality-check)), so the practical odds of a random guess landing on a real, currently-valid code are effectively nil even before rate limiting is considered.

**Guestless-booking bootstrap, a related and narrower trade**: staff-logged and Airbnb-imported bookings never get a `Guest` account automatically (only guest self-service bookings do). A prior version of this flow returned `{needsEmail: true}` on first sign-in for these and required the guest to additionally supply a matching email before a session was minted. **That step has since been removed** — `verify-confirmation/route.ts` now bootstraps a placeholder-email `Guest` record and mints a session immediately on a valid, currently-active confirmation number alone, guestless or not. Net effect: a guessed code that happens to be real and currently valid is now immediately fully usable, not merely "identifiable as real but still needing a matching email." Accepted for the same entropy/rate-limit reasons above (see the trade-off explained just above this one) — flagged here so it's an explicit, tracked trade-off rather than a silent regression from what was previously documented.

## Input validation & injection

- **SQL/NoSQL injection**: not applicable in practice — every database access goes through Prisma's ORM query builder (parameterized under the hood). Grepped the full codebase for `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe`: zero matches in application code (only used, safely, in one-off maintenance scripts outside the app itself).
- **Request validation**: every mutating API route validates its body with a **Zod** schema (`src/lib/validation.ts`) before touching the database; unrecognized fields are stripped by Zod's default behavior (this is also what caused a real, previously-fixed bug — see [Changelog.md](Changelog.md) — where several Settings fields were silently dropped because they were missing from the schema, not maliciously, just an oversight).
- **XSS**: zero uses of `dangerouslySetInnerHTML` anywhere in the codebase (grepped). React's default JSX escaping is relied on throughout; user-supplied text is never rendered as raw HTML.
- **Path traversal**: the photo-proxy route validates `photo_reference` against a strict `/^[A-Za-z0-9_-]{20,4096}$/` pattern before using it in an outbound request.

## File upload validation

Guest payment-proof upload (`/api/guest/bookings/[id]/payment-proof`) is the one user-facing file upload:
- Real **magic-byte** signature check (JPEG/PNG/GIF/WEBP headers) — a client-supplied `Content-Type` label alone is never trusted.
- 8MB size cap.
- Rate-limited (10 per 10 minutes per guest) — each upload also triggers a real, billed Gemini Vision call.
- Stored in Vercel Blob under an unpredictable, extension-sanitized key — never on a locally-executable path.
- Ownership is checked (`guestId` + `bookingId` match) inside `verifyGuestPaymentProof`, though the Blob upload itself happens just before that check — a signed-in guest could cause a wasted (rate-limited) upload attempt against an arbitrary `bookingId` before the 404; low-severity resource-waste note, not a data-exposure issue.

## Rate limiting

`src/lib/rateLimit.ts` — in-memory, best-effort, per server instance (not a hard guarantee across Vercel's multiple serverless instances, but meaningfully raises the bar for a single source). Applied to every public/guest-facing write and auth-adjacent endpoint: guest magic-link request, confirmation-number login, coupon check, payment-proof upload, guest request submission, WiFi/door-code reveal, iCal export, booking-ID reactivate/regenerate. **Not** applied to `POST /api/guest/bookings` (booking creation itself) — flagged as a real, currently-open gap below.

## Security headers

`next.config.mjs` sets, on every response:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`, explicit allowances for Google Maps JS API script/connect/img, Vercel Blob images, `'unsafe-inline'` + `'unsafe-eval'` for script (see note below), `object-src 'none'`, `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |

`script-src` needs both `'unsafe-inline'` (Next.js's own inline hydration/RSC scripts — a full nonce-based strict CSP would require generating a per-request nonce in middleware, a larger dedicated change not made here) and `'unsafe-eval'` (confirmed by live-testing the Maps page — the Google Maps JS API itself evaluates dynamically generated code internally; this is a documented characteristic of that library, not something this app's own code does).

`images.remotePatterns` in `next.config.mjs` was found wildcarded to `hostname: "**"` — meaning the built-in `/_next/image` optimizer route was reachable as an open SSRF/DoS proxy for arbitrary URLs, even though the app has zero `next/image` component usage. **Fixed**: restricted to the one real host in use (`*.public.blob.vercel-storage.com`).

## Secrets handling

- All secrets read from `process.env`, never hardcoded — confirmed by grepping for the `AIza...` (Google API key) literal pattern across `src/`: zero matches.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is the one intentionally client-exposed key (Google's own documented pattern for the Maps JS API — see [Integrations.md](Integrations.md#google-maps-javascript-api)); `GOOGLE_PLACES_API_KEY` (server-only, different key in principle, currently the **same literal value** as the Maps key — see below) never reaches client code.
- No `localStorage`/`sessionStorage` usage stores a session token, password, or API key — the only `localStorage` use in the app is a client-side favorites list (place names, not sensitive) and theme/PWA-install preferences.

## Known gaps

Disclosed, not fixed as part of this pass — listed here so they're tracked, not silently left undocumented:

1. **Messenger webhook signature verification** — the `POST` handler doesn't verify Meta's `X-Hub-Signature-256` header before processing a payload. Low severity today (the handler only logs; no reply is sent, nothing is written to the database from webhook content), but should be added before that handler does anything more than log.
2. **No rate limit on `POST /api/guest/bookings`** (booking creation itself) — every other public write endpoint is rate-limited; this one, the highest-value public write, currently isn't.
3. **`GOOGLE_PLACES_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` share the same literal value** in the current environment (confirmed via `.env.local`) — see below.
4. **Next.js 14.2.35** has several published advisories fixed only in v15/v16 (see [Performance.md](Performance.md#dependency-audit)) — none apply to this app's actual configuration (no Server Actions, no i18n, no `next/image` usage), but a major-version upgrade to fully resolve them was deliberately not performed as part of this pass (out of scope — real regression risk, needs its own dedicated effort).
5. **No server-side session revocation on logout** — staff sessions use NextAuth's stateless JWT strategy (`src/lib/auth.ts`, no `maxAge` override, so the 30-day default applies), signed and expiration-checked server-side on every request (not a client-redirect-only check — confirmed by direct code read). But logout only clears the client-side cookie; there's no server-side token blocklist or session-version check, so a captured/copied cookie stays valid if replayed elsewhere until its own 30-day expiry, even after the original user has "logged out." Inherent to the JWT strategy rather than a coding bug — fixing it for real means adding server-side session state (a token blocklist, or a `sessionVersion` column on `User` bumped on logout/password change and checked in the `jwt` callback), which is a real architectural addition, not a quick patch.
6. **Password policy is a 6-character minimum with no complexity requirement** (`src/lib/validation.ts` — `z.string().min(6)` on both `newPassword` and `password`, no uppercase/digit/symbol check). Applied consistently everywhere a password is set, and `mustChangePassword` is genuinely enforced (blocks every other route via `src/middleware.ts` until changed) — so the gap is the policy strength itself, not an enforcement bypass.
7. **WiFi/door-code reveal no longer requires re-entering the booking confirmation number** — removed in favor of "sign in once, unlock the whole guest dashboard" (see [WiFi/door-code reveal gate](#wifidoor-code-reveal-gate) above). A guest's own signed-in session left open on a shared/public device now reveals both with no further confirmation step, where a prior version of this app required one specifically to defend against that scenario.
8. **A guessed-but-real, currently-valid confirmation number now immediately mints a usable session with no second factor** — the email-matching step for guestless (staff-logged/Airbnb-imported) bookings was removed (see [Booking-ID-only sign-in](#booking-id-only-sign-in-guest-hub-quick-unlock) above). Mitigated by the code's own entropy and layered per-IP + global rate limiting, same reasoning already documented there, but worth tracking as a real change from what this doc previously described.

## Google API key scope

`GOOGLE_PLACES_API_KEY` (server-only) and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client-exposed) are currently set to the **same key value**. Recommended, and not something this codebase can do on its own: in Google Cloud Console, either split these into two separate keys (one HTTP-referrer-restricted for the browser-facing Maps JS API, one IP/server-restricted for the Places API calls that never leave the server) or, at minimum, restrict the shared key's allowed APIs to only what's actually used.
