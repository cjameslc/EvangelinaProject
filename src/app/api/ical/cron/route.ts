import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncUnitFromAirbnb } from "@/lib/icalSync";

// Periodic Airbnb import — invoked by Vercel Cron (see vercel.json). Airbnb
// has no webhook, so this scheduled pull plus the always-live export
// endpoint is the sync loop. Runs once daily — the Hobby plan's cron limit —
// so "Sync Now" in Admin → Units is the fastest path for an immediate sync;
// this cron is the background catch-up. Vercel signs its own cron requests
// with this same CRON_SECRET as a Bearer token; a manual ?secret=... query
// param is accepted too for local/manual testing.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 500 });
  const auth = req.headers.get("authorization");
  const queryToken = req.nextUrl.searchParams.get("secret");
  if (auth !== `Bearer ${secret}` && queryToken !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const units = await prisma.unit.findMany({ where: { icalImportUrl: { not: null } }, select: { id: true, shortName: true } });
  const results = [];
  for (const unit of units) {
    const result = await syncUnitFromAirbnb(unit.id);
    results.push({ unit: unit.shortName, ...result });
  }
  return NextResponse.json({ synced: units.length, results });
}
