import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { syncAllUnitsAccessEvents } from "@/lib/access/eventSync";
import { rateLimit } from "@/lib/rateLimit";

/**
 * "Check now" — the manual counterpart to the shared daily cron (see
 * ical/cron/route.ts's own comment on why this account's TTLock tier plus
 * the hosting plan's single cron slot means there's no true real-time
 * push). Owner/Admin only: this is the one action that can fetch every
 * unit's real TTLock history on demand, not just view what's already
 * been classified.
 */
export async function POST() {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const limited = rateLimit(`security-events-sync:${user.id}`, 6, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const result = await syncAllUnitsAccessEvents();
  return NextResponse.json(result);
}
