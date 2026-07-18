# Evangelina's Staycation — Web App

A full rebuild of the Evangelina's Staycation Airbnb-management HTML prototypes as a real, database-backed web app:

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, TypeScript
- **Database:** Postgres via [Neon](https://neon.tech), accessed with Prisma ORM
- **Auth:** NextAuth (Credentials provider, JWT sessions) with role-based access control

It keeps the same look, feel and page-by-page structure as the original HTML mockups (Dashboard, Bookings, Calendar, Housekeeping), and adds the two pages and the role system that were missing from the prototype: **Auditor** and **Admin**, plus five real user roles enforced both in the UI and on every API route.

## Roles

| Role | Access |
|---|---|
| **Owner / Admin** | Every unit, every page, including Admin (manage units, users, settings) |
| **Co-owner** | Dashboard, Bookings, Calendar, Housekeeping — scoped to only the units assigned to them |
| **Housekeeping** | Bookings, Calendar, Housekeeping, Auditor — no Dashboard (financials hidden) |
| **Booker** | Bookings, Calendar only |
| **Auditor** | Read-only Auditor page: bookings ledger, bills ledger, and the full system activity log |

Role checks live in `src/lib/rbac.ts`, are enforced again in `src/middleware.ts` (route-level redirects) and in every `src/app/api/**/route.ts` handler (so the API can't be called directly to bypass the UI).

## Project layout

```
prisma/schema.prisma      Database schema (Users, Units, Bookings, Housekeeping, Bills, Audit log, ...)
prisma/seed.ts             Demo data: 5 units, one user per role, sample bookings/cleaning/bills
src/lib/                   auth.ts, rbac.ts, session.ts, constants.ts, validation.ts, prisma client
src/middleware.ts          Role-based route protection
src/app/api/**             REST-ish API routes (bookings, calendar, housekeeping, units, users, audit, settings)
src/app/**/page.tsx        Server components: fetch + scope data, then render a client view
src/components/**          Client components for each page (forms, tables, modals, checklists)
```

## 1. Set up Neon

1. Create a free project at [neon.tech](https://neon.tech).
2. In the Neon dashboard, open **Connection Details** and copy:
   - the **pooled** connection string → `DATABASE_URL`
   - the **direct (unpooled)** connection string → `DIRECT_URL` (Prisma Migrate needs a direct connection)
3. Copy `.env.example` to `.env` and fill in both, plus a `NEXTAUTH_SECRET` (generate one with `openssl rand -base64 32`).

## 2. Install & initialize

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init   # creates all tables on your Neon database
npm run db:seed                      # loads 5 units + one demo user per role
npm run dev                          # http://localhost:3000
```

> This project was authored in a sandboxed environment with no network access, so **none of the above commands have been run yet** — `npm install` and the Prisma steps need to happen on your machine (or wherever you deploy it) before it will boot.

## 3. Demo accounts

All seeded accounts use the password `password123`:

| Role | Email |
|---|---|
| Owner / Admin | `owner@evangelinas.ph` |
| Co-owner (scoped to 2 units) | `coowner@evangelinas.ph` |
| Housekeeping | `housekeeping@evangelinas.ph` |
| Booker | `booker@evangelinas.ph` |
| Auditor | `auditor@evangelinas.ph` |

Change these (or add real staff accounts) from the **Admin → Users & roles** tab once logged in as Owner/Admin.

## Notes & known simplifications

- **Proof-of-payment / receipt images** are stored as base64 data URLs directly in the database (capped at 4MB per upload) rather than an object-storage bucket — simplest thing that works without adding an S3/Blob dependency. Swap in Vercel Blob, S3, or Cloudinary later by changing `fileToDataUrl` in `src/lib/file.ts` and the `proofUrl`/`receiptUrl` columns stay the same (just URLs).
- The **Calendar** page uses a simplified single-lane grid per unit/day (chips stack when Daycation + Night share a date) rather than the original's pixel-positioned dual swim-lane layout — same information, simpler implementation.
- **Dashboard** figures (earnings, occupancy, payroll) are computed live from real bookings/bills instead of the hardcoded demo numbers in the original mockup.
- Deploy target: this runs cleanly on Vercel (or any Node host) — just set the same three env vars there.
