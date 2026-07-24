# Integrations

> Part of the [Evangelina's Staycation documentation](README.md).

- [Google Maps JavaScript API](#google-maps-javascript-api)
- [Google Places API](#google-places-api)
- [Google Gemini](#google-gemini)
- [Airbnb iCal sync](#airbnb-ical-sync)
- [Vercel Blob](#vercel-blob)
- [Resend (email)](#resend-email)
- [Meta Messenger webhook](#meta-messenger-webhook)
- [NextAuth](#nextauth)

## Google Maps JavaScript API

**Client-exposed** key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Loaded via a hand-rolled singleton script loader (`src/lib/places/loadGoogleMaps.ts`) rather than the `@types/google.maps` package — a deliberate, isolated `any`-typed boundary in that one file plus `NearbyMap.tsx`, to avoid a dependency for types-only usage. Powers the interactive map on each `/guide/nearby/[category]` page: property marker + color-coded per-category place markers, click-to-select, and a real `DirectionsService`/`DirectionsRenderer` walking route when a place is selected.

**Known requirement**: this key is exposed to the browser by design (this is Google's own documented pattern for the Maps JS API) but should be **HTTP-referrer-restricted** in Google Cloud Console to this app's actual domain(s) — confirming/enforcing that restriction is a manual step in the Google Cloud Console, not something this codebase can verify or configure itself. See [Security.md](Security.md#google-api-key-scope).

## Google Places API

**Server-only** key: `GOOGLE_PLACES_API_KEY` — never sent to the browser. Client code only ever receives the *results* of a lookup (via Prisma-cached `PlaceInsight` rows) or a proxied photo byte stream (`/api/places/photo`, which takes only Google's own opaque `photo_reference` token, regex-validated, and fetches server-side).

`src/lib/places/googlePlacesClient.ts` (`lookupPlace`) calls, per place, per refresh:
1. **Find Place** (classic JSON endpoint) — resolves a name to a `place_id`.
2. **Place Details** — `geometry, opening_hours, rating, user_ratings_total, editorial_summary, business_status, price_level, formatted_phone_number, website, photos`.
3. **Distance Matrix** × 2 (walking, driving) — only when the property's origin coordinates are set (`Settings.propertyLat`/`propertyLng`).
4. Optionally, **Gemini** generates a short host-voice blurb strictly grounded in the real fetched facts (never invents a claim the data doesn't support).

**Refresh model**: one row per `(category, name)` in `PlaceInsight`, refreshed **only** by an explicit Admin button-click (Admin → Settings → Nearby places data) — never on a schedule, since each refresh is a sequence of real, billed Google API calls. A failed lookup sets `fetchError` and leaves any prior good data untouched, rather than wiping it.

## Google Gemini

`src/lib/ai/geminiClient.ts` — model `gemini-flash-latest` (pinned versions like `gemini-2.5-flash`/`gemini-2.0-flash`/`gemini-1.5-flash` were confirmed unavailable at the time this was built, despite appearing in `ListModels`). `GEMINI_API_KEY`, server-only.

Three distinct uses, each with its own strict "never invent" system prompt:

| Use | File | Notes |
|---|---|---|
| **Guest AI Concierge** | `assistantService.ts` | Chat-style (`askGeminiChat`), grounded in real live-fetched context (`assistantContext.ts`) — units, occupancy, the signed-in guest's own bookings (WiFi/door-code **availability only**, never the actual value — see [Security.md](Security.md#ai-concierge-grounding)), and the guidebook content. Emits `[ESCALATE]` when it can't answer from real data. |
| **Payment-proof verification** | `paymentVerification.ts` | Gemini **Vision** (`inlineData` image part) — analyzes an uploaded payment screenshot against the expected date/amount, returns a structured `{isPaymentConfirmation, confidence, date, amountCentavos, reasoning}`. Drives the `auto_approved`/`needs_review`/`rejected` outcome in [Booking.md](Booking.md#payment-lifecycle). |
| **Place host-overview blurb** | `placeOverview.ts` | 2–3 sentence host-voice description per nearby place, generated once per `PlaceInsight` refresh, strictly from that place's own real fetched fields. Returns `null` (never a fallback string) on any failure. |
| **Dashboard insight** | `dashboardInsight.ts` | AI-written summary of the day's real financial/operational figures for the Dashboard. |

## Airbnb iCal sync

Two directions:
- **Import** (`src/lib/icalSync.ts`) — pulls each unit's Airbnb `.ics` feed (`Unit.icalImportUrl`) and creates/updates/removes `Booking` rows (`source = "AIRBNB"`, deduped by `[unitId, externalUid]`). Airbnb's `.ics` carries no price, so revenue is derived as `nights × AIRBNB_NIGHTLY_RATE` (a fixed constant, `₱1,495`, in `src/lib/constants.ts`) — not a real per-booking amount. Runs on a **daily Vercel Cron** (`vercel.json`, `0 18 * * *` UTC = 2 AM Manila) hitting `GET /api/ical/cron` (protected by `CRON_SECRET`), or manually via "Sync Airbnb"/"Sync all units" in the UI.
- **Export** (`GET /api/ical/[token].ics`) — the feed URL a guest/host can subscribe to from Google Calendar etc. Secured by an unguessable per-unit `icalToken` (the URL carries no other identifying info), rate-limited per token+IP.

## Vercel Blob

`BLOB_READ_WRITE_TOKEN`. Used for exactly two upload types — both deliberately **not** base64-in-database, after this app repeatedly hit real page-payload-bloat problems from earlier base64 image fields (Booking proof images, Bill receipts):
- Guest payment-proof screenshots (`src/lib/blob.ts` → `uploadGuestPaymentProof`)
- Housekeeping in-progress cleaning photos (`uploadHousekeepingPhoto`)

Both generate an unpredictable key (`{category}/{id}/{timestamp}-{random}.{ext}`, extension sanitized from the MIME type) rather than a guessable filename.

## Resend (email)

`RESEND_API_KEY`. `src/lib/email.ts` — guest magic-link emails and booking-confirmation emails. Sender address is `RESEND_FROM_EMAIL` if set, else falls back to Resend's own sandbox address (`onboarding@resend.dev`) — meaning a production deployment that hasn't set `RESEND_FROM_EMAIL` is still sending from a Resend test address, which is likely not the intended production behavior (see [Troubleshooting.md](Troubleshooting.md)).

## Meta Messenger webhook

`GET/POST /api/messenger/webhook`. `MESSENGER_VERIFY_TOKEN` for Meta's one-time subscription handshake (GET). The **POST** handler (real inbound events) currently only logs the payload — no reply is sent (would require a Page Access Token, not currently configured) and, per [Security.md](Security.md#known-gap-messenger-webhook-signature), it does not yet verify Meta's request signature.

## NextAuth

v4, Credentials provider, JWT session strategy — see [Architecture.md](Architecture.md#two-separate-auth-systems) and `src/lib/auth.ts`. `NEXTAUTH_SECRET`/`NEXTAUTH_URL`.
