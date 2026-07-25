import { NextRequest, NextResponse } from "next/server";
import { syncAllUnitsFromAirbnb } from "@/lib/icalSync";
import { syncAllUnitLocks } from "@/lib/ttlockSync";
import { warmUnsplashCache } from "@/lib/unsplash/service";

// Periodic Airbnb import — invoked by Vercel Cron (see vercel.json). Airbnb
// has no webhook, so this scheduled pull plus the always-live export
// endpoint is the sync loop. Runs once daily — the Hobby plan's cron limit —
// so "Sync Now" in Admin → Units is the fastest path for an immediate sync;
// this cron is the background catch-up. Vercel signs its own cron requests
// with this same CRON_SECRET as a Bearer token; a manual ?secret=... query
// param is accepted too for local/manual testing.
//
// Also piggybacks the daily TTLock battery/gateway fallback sync
// (syncAllUnitLocks) and the Unsplash image-cache warm (warmUnsplashCache)
// — same "no new Vercel cron slot" discipline throughout: the Hobby plan's
// daily-only limit is already spent on this one slot, so every periodic
// job in this app shares it rather than asking for another.
//
// maxDuration extended past the 10s default: a fully-cold Unsplash cache
// (every one of ~32 categories stale at once — only realistically happens
// on the very first run after deploy) paces itself at ~1s between calls to
// stay well clear of the 50/hour rate limit, which alone can approach 30s;
// combined with the iCal/TTLock work this can exceed the default timeout.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 500 });
  const auth = req.headers.get("authorization");
  const queryToken = req.nextUrl.searchParams.get("secret");
  if (auth !== `Bearer ${secret}` && queryToken !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await syncAllUnitsFromAirbnb("AUTOMATIC");
  // Best-effort, sequential after the Airbnb sync — a hiccup in either of
  // these must never fail this cron run or block the (unrelated) iCal
  // sync results.
  const lockResults = await syncAllUnitLocks().catch(() => []);
  const unsplashResults = await warmUnsplashCache().catch(() => []);
  return NextResponse.json({
    synced: results.length,
    results: results.map((r) => ({ unit: r.unit, ...r.result })),
    ttlock: lockResults,
    unsplash: unsplashResults,
  });
}
