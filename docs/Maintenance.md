# Maintenance

> Part of the [Evangelina's Staycation documentation](README.md).

- [Keeping documentation current](#keeping-documentation-current)
- [Schema changes](#schema-changes)
- [Rotating secrets](#rotating-secrets)
- [Recommended cleanup](#recommended-cleanup)
- [Routine checks](#routine-checks)

## Keeping documentation current

This `/docs` set is only useful as long as it matches the code. Whenever a change touches:
- a database field/model → update [Database.md](Database.md)
- an API route → update [API.md](API.md)
- a business rule (rate, commission, validity window) → update [Business-Rules.md](Business-Rules.md)
- a new integration or env var → update [Integrations.md](Integrations.md) / [Configuration.md](Configuration.md)
- a security-relevant decision → update [Security.md](Security.md)

...update the doc **in the same change**, not as a follow-up. Record anything notable in [Changelog.md](Changelog.md). If something can't be verified against the current codebase, mark it explicitly as **Not Yet Implemented** or **Unable to Determine from Current Codebase** rather than guessing — several such gaps are already flagged throughout this set where they were found (e.g. push notifications, the seed script's currency against the current schema).

## Schema changes

There is no migration history (see [Database.md](Database.md#migrations)) — the actual working procedure used throughout this project's history:

1. Write a one-off Node script using `@libsql/client`'s parameterized `execute({sql, args})` to run the `ALTER TABLE`/`CREATE TABLE` statement directly against the live Turso database.
2. Edit `prisma/schema.prisma` to match exactly.
3. Run `npx prisma generate`.
4. **Restart any running local dev server** — a long-running `next dev` process holds a Prisma Client singleton in memory (`src/lib/prisma.ts`) that does not automatically pick up a regenerated client; a schema field added this way will 500 with a Prisma validation error until the dev server process is restarted. This is a real gotcha hit during this project's actual development, not a hypothetical.

## Rotating secrets

Any of the secrets in [Configuration.md](Configuration.md) can be rotated independently — none are derived from each other. After rotating one in Vercel's environment variables, redeploy for it to take effect (`vercel env` changes require a new deployment to apply to already-running instances).

## Recommended cleanup

Found during this documentation pass, not yet acted on:

1. **Root `README.md`** — rewrite to reflect the current Turso-based stack, or replace with a short pointer into `/docs/README.md`, so a new contributor doesn't start from the stale Postgres/Neon instructions.
2. **`docker-compose.yml`** — either remove (the app doesn't use local Postgres) or clearly mark as legacy/unused.
3. **`.env.example`** — rewrite to list the actual current variable names from [Configuration.md](Configuration.md), not the old `postgresql://`/`DIRECT_URL` template.
4. **`NEON_DATABASE_URL`/`NEON_DIRECT_URL`** — remove from `.env.local` and Vercel's environment variables; confirmed unreferenced anywhere in the codebase.
5. **Messenger webhook signature verification** — see [Security.md](Security.md#known-gaps).
6. **Rate limit `POST /api/guest/bookings`** — see [Security.md](Security.md#known-gaps).
7. **Split or restrict the shared Google API key** — see [Security.md](Security.md#google-api-key-scope).

## Routine checks

- `npm run lint` / `npx tsc --noEmit` before any deploy.
- `npm audit` periodically — see [Performance.md](Performance.md#dependency-audit) for how to judge whether a flagged advisory actually applies to this app before reacting to it.
- Spot-check the Admin → Settings → "Nearby places data" refresh occasionally — `PlaceInsight` rows only update on manual refresh and can go stale (hours/ratings/photos) indefinitely otherwise.
