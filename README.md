# Evangelina's Staycation — Web App

A property-management app for a 5-unit short-term rental business (Urban Deca Towers, Cubao, Quezon City) — staff operations (bookings, calendar, housekeeping, payroll, analytics, admin) plus a full guest-facing Digital Guidebook and self-service booking flow.

**Full documentation lives in [`/docs`](docs/README.md).** Start there — it's kept in sync with the actual codebase, verified by direct inspection rather than written from memory. This file is intentionally a short pointer, not a duplicate.

## Quick facts

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Database:** Turso (libSQL/SQLite) via Prisma ORM — see [docs/Database.md](docs/Database.md)
- **Auth:** two independent systems — NextAuth (staff) and a custom guest JWT system — see [docs/Architecture.md](docs/Architecture.md#two-separate-auth-systems)
- **Deploy target:** Vercel — see [docs/Deployment.md](docs/Deployment.md)

## Get started

```bash
npm install
# fill in .env.local — see docs/Configuration.md for the full variable list
npx prisma generate
npm run dev   # http://localhost:3000
```

Full setup instructions: [docs/Installation.md](docs/Installation.md).

## Known stale files in this repository

`docker-compose.yml` (spins up Postgres — unused; the app runs on Turso) and `.env.example` (still templates the old Postgres connection-string format) predate the current stack and have not yet been updated or removed — see [docs/Troubleshooting.md](docs/Troubleshooting.md#known-stale-files-not-bugs-but-will-mislead-you-if-trusted) and [docs/Maintenance.md](docs/Maintenance.md#recommended-cleanup).
