# Configuration

> Part of the [Evangelina's Staycation documentation](README.md). Variable **names** only — real values live in `.env.local` (never committed) and Vercel's project environment settings.

- [Environment variables](#environment-variables)
- [Unused/stale variables](#unusedstale-variables)
- [Runtime configuration (Settings model)](#runtime-configuration-settings-model)

## Environment variables

Inventory taken directly from `.env.local`'s key names (values never read or reproduced here).

| Variable | Server-only? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Turso (libSQL) connection URL — see [Database.md](Database.md) |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |
| `NEXTAUTH_SECRET` | Yes | Staff JWT signing secret |
| `NEXTAUTH_URL` | Yes | Canonical app URL, required by NextAuth |
| `GUEST_SESSION_SECRET` | Yes | Guest JWT signing secret — deliberately **different** from `NEXTAUTH_SECRET`, so the two session systems can't be confused for each other even if one secret leaked |
| `GOOGLE_PLACES_API_KEY` | Yes | Google Places API — see [Integrations.md](Integrations.md#google-places-api). **Currently the same literal value as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`** — see [Security.md](Security.md#google-api-key-scope) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **No — sent to the browser** | Google Maps JavaScript API, by Google's own design for that product |
| `GEMINI_API_KEY` | Yes | Google Gemini — AI Concierge, payment verification, place blurbs, dashboard insight |
| `RESEND_API_KEY` | Yes | Resend transactional email |
| `RESEND_FROM_EMAIL` | Yes | *(Referenced in code with a fallback default — not confirmed present/set. If unset, email sends from Resend's sandbox address, not a real business address.)* |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob — guest payment proofs, housekeeping photos |
| `CRON_SECRET` | Yes | Authenticates Vercel Cron's daily hit to `/api/ical/cron` |
| `MESSENGER_VERIFY_TOKEN` | Yes | Meta Messenger webhook verification handshake |
| `NEXT_TELEMETRY_DISABLED` | Build-time | Opts out of Next.js's anonymous telemetry |
| `VERCEL_OIDC_TOKEN` | Managed by Vercel | Vercel platform-internal — not application config |

## Unused/stale variables

Present in `.env.local` but **not referenced anywhere in `src/` or `prisma/`** (confirmed by grep) — safe to remove, kept here only so nobody assumes they're load-bearing:

- `NEON_DATABASE_URL`
- `NEON_DIRECT_URL`

These are leftovers from an earlier Postgres/Neon-based version of this project — see [Folder-Structure.md](Folder-Structure.md#known-inaccuracies-in-root-level-files) for the related stale-README/docker-compose note.

## Runtime configuration (Settings model)

Most business-tunable configuration (rates, payroll figures, Guest Experience content, property coordinates) is **not** an environment variable — it's the `Settings` singleton database row, editable from Admin → Settings without a deploy. See [Database.md](Database.md#models) for the full field list and [Admin-Portal.md](Admin-Portal.md#settings-tab) for the editing UI.
