# Deployment

> Part of the [Evangelina's Staycation documentation](README.md).

- [Platform](#platform)
- [Deploy steps](#deploy-steps)
- [Cron job](#cron-job)
- [Environment variables in Vercel](#environment-variables-in-vercel)
- [Post-deploy verification](#post-deploy-verification)

## Platform

**Vercel.** Confirmed by: `vercel.json` (cron config), a `.vercel/` local project-link directory present in the repository, and this being the deployment target used throughout this project's actual development (every feature verified against a real `vercel deploy --prod` before being considered done).

## Deploy steps

```bash
npx vercel deploy --prod
```

(Requires the Vercel CLI to be authenticated and the local project already linked — see the `.vercel/` directory. `npx vercel login` / `npx vercel link` if setting this up fresh.)

There is no CI/CD pipeline file (no `.github/workflows/`) — deploys are triggered manually via the CLI, not automatically on push. `npm run build` runs as part of Vercel's own build step.

## Cron job

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/ical/cron", "schedule": "0 18 * * *" }
  ]
}
```

Runs daily at 18:00 UTC (02:00 Asia/Manila) — pulls every unit's Airbnb iCal feed. Vercel signs its own cron requests with a Bearer token matching `CRON_SECRET`; the same endpoint also accepts `?secret=...` for manual/local testing. **Vercel's Hobby plan limits cron jobs to once per day** — this is why the Calendar page's "Sync Now" manual trigger exists as the fast path for an immediate sync, with this cron as the background catch-up (per the route's own code comment).

## Environment variables in Vercel

Every variable in [Configuration.md](Configuration.md) needs to be set in the Vercel project's Environment Variables settings (Production, and Preview/Development as needed) — they are **not** read from `.env.local` in a deployed environment. Set via the Vercel dashboard or `vercel env add <NAME>`.

## Post-deploy verification

The established practice throughout this project (not a formal checklist file, but the consistent pattern used for every shipped change): after deploying, hit the live URL directly — `curl` a handful of key pages for a `200`, check response headers for expected values (e.g. security headers), and exercise the specific feature that changed end-to-end against production data (creating and then cleaning up real test rows via direct database access when a full flow needs verifying, e.g. a test guest/booking to verify an auth-gated flow). Never considered done on "the build succeeded" alone.
