# Installation

> Part of the [Evangelina's Staycation documentation](README.md). This describes the **actual current** Turso-based setup — the root `README.md` still describes an older Neon/Postgres setup; see [Folder-Structure.md](Folder-Structure.md#known-inaccuracies-in-root-level-files).

## Prerequisites

- Node.js (repository was built/tested against a recent LTS; no `.nvmrc`/`engines` field pins an exact version in `package.json`)
- npm
- A [Turso](https://turso.tech) account (or another libSQL-compatible database)
- Accounts/API keys for whichever integrations you want live locally — see [Configuration.md](Configuration.md) (the app degrades gracefully without most of them: Google Maps/Places, Gemini, Resend, Vercel Blob, Messenger are all optional at the code level, each with an honest "not available" fallback rather than a crash)

## 1. Clone and install

```bash
git clone <repository-url>
cd evangelinas-staycation
npm install
```

`postinstall` automatically runs `prisma generate`.

## 2. Set up the database

1. Create a Turso database (`turso db create <name>` via the Turso CLI, or through the Turso dashboard).
2. Get the database URL (`turso db show <name> --url`) and an auth token (`turso db tokens create <name>`).
3. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (the `libsql://...` URL) and `TURSO_AUTH_TOKEN`.

   > **Note**: `.env.example` as it currently exists in the repository describes the old Postgres/Neon variables (`DATABASE_URL`/`DIRECT_URL` as `postgresql://...`), not the current Turso ones — see [Troubleshooting.md](Troubleshooting.md). Use the variable names in [Configuration.md](Configuration.md), not the literal template in that file.

4. Apply the schema. **There is no migration history** (`prisma migrate`/`prisma db push` have not been used to build this schema — see [Database.md](Database.md#migrations)) — the schema was built via direct `ALTER TABLE`/`CREATE TABLE` statements against the live database. For a brand-new database, `npx prisma db push` (which syncs the schema without generating migration files) is the closest equivalent to how this schema has actually been managed, though it has not been the tool used historically. Confirm the resulting table set matches `schema.prisma` before relying on it.

## 3. Fill in the remaining environment variables

See [Configuration.md](Configuration.md) for the complete list and what each one is for. Minimum to boot the app at all: `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GUEST_SESSION_SECRET`.

```bash
# Generate secrets:
openssl rand -base64 32
```

## 4. Seed demo data (optional)

```bash
npm run db:seed
```

Runs `prisma/seed.ts` — creates 5 units and one demo user per role. **Not verified as part of this documentation pass** to still match the current schema (it predates several schema additions) — run it against a disposable/local database first, not directly against production.

## 5. Run

```bash
npm run dev       # http://localhost:3000
```

## 6. Verify

- `/login` — staff sign-in should load
- `/` — the Digital Guidebook hub should render (no login required)
- `npx tsc --noEmit` — should complete with no errors
- `npm run build` — should complete successfully
