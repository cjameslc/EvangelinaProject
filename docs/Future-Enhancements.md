# Future Enhancements

> Part of the [Evangelina's Staycation documentation](README.md). Genuine gaps and disclosed trade-offs found while building/documenting this system — not a speculative roadmap. Each item links to where it's discussed in more detail.

## Not yet implemented

- **Push notifications** — `public/sw.js` has empty `push`/`notificationclick` service-worker event handlers; `GuestNotification` rows populate an in-app inbox only. No push subscription/delivery mechanism is wired up. See [Guest-Portal.md](Guest-Portal.md#notifications).
- **Messenger bot replies** — the webhook receives and logs guest messages but never replies (requires a Page Access Token for the Send API, not currently configured). See [Integrations.md](Integrations.md#meta-messenger-webhook).
- **TTLock (or similar smart-lock) integration** — no evidence found anywhere in the codebase of a smart-lock/IoT integration. Door codes are static, admin-entered text per unit (`Unit.doorCode`), not generated or revoked by an external lock API. If this was previously planned, it has not been built.
- **"Popular dishes" per restaurant, "pet-friendly" filter** (Nearby Places) — both were considered during the Guest Experience build-out and intentionally omitted: no reliable Google Places field backs either one, and the project's standing rule is to never fabricate a data point it can't verify.
- **A real Guest Reviews collection mechanism** — the reviews shown on `/guide/reviews` are static content supplied directly by the business, not user-submitted through the app. There's no in-app flow for a guest to leave a review that appears there.
- **Check-in/check-out/cleaning reminder notifications** — `checkin.reminder` and `checkout.reminder` exist as declared types in `notificationService.ts`'s `NotificationEvent` union (with real message text in `MESSAGES`), but nothing in the codebase ever calls `notify()` with either type, and no cron/scheduled route exists for them (`vercel.json`'s only cron is the Airbnb iCal sync) — there's no "cleaning reminder" type at all. Staff currently see upcoming check-ins/outs/cleanings only as manually-checked list items on the Dashboard/Housekeeping pages, not as pushed/triggered notifications. Building the real thing needs product decisions this codebase doesn't make on its own (how far ahead to remind, which channel — the existing guest in-app inbox, email, both).
- **Staff-facing notification inbox for booking events** — `notify()` (`src/lib/bookingEngine/notificationService.ts`) writes exclusively to `GuestNotification`, guest-only. A payment received, a booking cancelled, etc. has no equivalent inbox entry for the Owner/Booker/Co-owner who'd want to know. The chat bell icon (`NotificationCenter.tsx`) is a separate, session-local log for internal chat messages only — unrelated to booking events.

## Deliberately deferred (disclosed trade-offs, not oversights)

- **Nonce-based strict CSP** — the current CSP uses `'unsafe-inline'`/`'unsafe-eval'` for `script-src` (see [Security.md](Security.md#security-headers)). A stricter, nonce-based policy would require generating a per-request nonce in `middleware.ts` and threading it through Next's own inline hydration scripts — a larger, separately-testable change.
- **Next.js 14 → 15/16 upgrade** — resolves the remaining framework-level `npm audit` advisories, but is a genuine breaking change (async `cookies()`/`headers()`, React version bump) against this app's App Router usage. See [Performance.md](Performance.md#dependency-audit).
- **Messenger webhook signature verification** — see [Security.md](Security.md#known-gaps).
- **Rate limiting on `POST /api/guest/bookings`** — see [Security.md](Security.md#known-gaps).
- **Split/restrict the Google API keys** — `GOOGLE_PLACES_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` currently share one literal value. See [Security.md](Security.md#google-api-key-scope).
- **Large-scale stress testing** — never performed against this app (5 units, ~30 real bookings at the time of writing) — see [Performance.md](Performance.md#scale-reality-check).

## Ideas raised but not committed to any plan

These surfaced during development conversations but have no code, schema, or design behind them — listed only so a future session doesn't need to re-derive that they were discussed:

- Splitting per-unit rate multipliers (the current rate table applies uniformly to all 5 units regardless of size/location).
- A dedicated support-ticket UI for `GuestRequest`/`AssistantEscalation` (currently queryable directly, no dashboard widget).
- Capacitor-wrapped native Android/iOS builds — `next.config.mjs` notes the app already satisfies Capacitor's usual prerequisites (relative API paths, no Node-only client code, a PWA manifest/service worker), but no Capacitor project exists in this repository.
