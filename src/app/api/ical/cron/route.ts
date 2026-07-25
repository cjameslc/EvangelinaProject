import { NextRequest, NextResponse } from "next/server";
import { syncAllUnitsFromAirbnb } from "@/lib/icalSync";
import { syncAllUnitLocks } from "@/lib/ttlockSync";

// Periodic Airbnb import — invoked by Vercel Cron (see vercel.json). Airbnb
// has no webhook, so this scheduled pull plus the always-live export
// endpoint is the sync loop. Runs once daily — the Hobby plan's cron limit —
// so "Sync Now" in Admin → Units is the fastest path for an immediate sync;
// this cron is the background catch-up. Vercel signs its own cron requests
// with this same CRON_SECRET as a Bearer token; a manual ?secret=... query
// param is accepted too for local/manual testing.
//
// Also piggybacks the daily TTLock battery/gateway fallback sync
// (syncAllUnitLocks) — the real-time webhook already covers a lock the
// moment it's used, this just catches any lock that hasn't generated an
// event recently enough. Deliberately not a second vercel.json cron entry:
// the Hobby plan's daily-only limit is already spent on this one slot.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 500 });
  const auth = req.headers.get("authorization");
  const queryToken = req.nextUrl.searchParams.get("secret");
  if (auth !== `Bearer ${secret}` && queryToken !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await syncAllUnitsFromAirbnb("AUTOMATIC");
  // Best-effort, sequential after the Airbnb sync — a TTLock hiccup must
  // never fail this cron run or block the (unrelated) iCal sync results.
  const lockResults = await syncAllUnitLocks().catch(() => []);
  return NextResponse.json({
    synced: results.length,
    results: results.map((r) => ({ unit: r.unit, ...r.result })),
    ttlock: lockResults,
  });
}
