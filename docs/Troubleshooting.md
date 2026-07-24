# Troubleshooting

> Part of the [Evangelina's Staycation documentation](README.md).

## "The app won't boot / Prisma errors on startup"

Check `DATABASE_URL` and `TURSO_AUTH_TOKEN` are both set and point at a real Turso database — see [Configuration.md](Configuration.md). Do **not** follow the connection-string format in the root `.env.example` literally; it still describes the old Postgres/Neon setup. Use `libsql://...` + a separate auth token, not a `postgresql://...` URL.

## "I added a Settings field in the UI but it never saves"

This has happened before, for a real reason: `PATCH /api/settings` validates the request body against `settingsSchema` in `src/lib/validation.ts`, and **Zod strips any field not explicitly listed in the schema by default** — silently, with no error. If a new `Settings` column was added to `schema.prisma` and the Admin UI, but `settingsSchema` wasn't updated to match, every save will appear to succeed while quietly dropping that field. Fix: add the field to `settingsSchema` (with the right type/validation), not just the schema and UI.

## "A guest says their WiFi/door code page just says 'unavailable' locally"

Confirmed during this documentation pass: the interactive map on `/guide/nearby/[category]` can show "Map unavailable right now" in local development even with no CSP errors and a 200 response from Google's script — most likely the `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is HTTP-referrer-restricted in Google Cloud Console to the production domain only, so `localhost` is silently rejected. This is expected in local dev if the key is properly restricted for production; it is not a code bug. The WiFi/door-code **reveal gate itself** (typing the booking ID) is unrelated to the map and doesn't depend on Google Maps at all.

## "Email isn't sending (or sends from a weird address)"

Check `RESEND_API_KEY` is set. If `RESEND_FROM_EMAIL` isn't set, the app falls back to Resend's own sandbox sender address (`onboarding@resend.dev`) rather than failing — so email *appears* to work but comes from an address guests won't recognize as the business. See [Configuration.md](Configuration.md).

## "The interactive map / photos don't load, but nothing else is broken"

Google Maps/Places integrations degrade gracefully by design — a missing/invalid `GOOGLE_PLACES_API_KEY` or `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` results in an honest "unavailable" state (map) or simply omitted fields (no distance/rating/photo on a place card), never a crash. If a whole page 500s instead, that's a real bug, not the expected degraded state — check server logs for the actual error rather than assuming it's just a missing key.

## "A booking's confirmation number stopped working"

Working as designed if the stay ended more than ~24 hours ago (or the booking was cancelled) — see [Business-Rules.md](Business-Rules.md#booking-id-confirmation-number-validity). An Owner/Admin can reactivate it or issue a new one from the booking's edit screen in `/bookings`.

## "npm audit shows vulnerabilities in Next.js"

Expected at the time of writing (Next 14.2.35) — see [Performance.md](Performance.md#dependency-audit) for which advisories actually apply to this app (very few) and why a full fix (major version upgrade) wasn't performed as part of routine hardening.

## Known stale files (not bugs, but will mislead you if trusted)

- Root `README.md` — describes an older Postgres/Neon-based version of this app. Use this `/docs` directory instead.
- `docker-compose.yml` — spins up Postgres, which the app doesn't use.
- `.env.example` — variable names/format don't match the actual Turso-based `Configuration.md`.

See [Maintenance.md](Maintenance.md) for the plan to address these.
