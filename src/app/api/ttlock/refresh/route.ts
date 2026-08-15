import { NextResponse } from "next/server";
import { requireUser, logAudit } from "@/lib/session";
import { syncAllUnitLocks } from "@/lib/ttlockSync";

/**
 * On-demand version of the daily cron's lock sync (src/app/api/ical/cron/
 * route.ts) — same syncAllUnitLocks() call, so an admin-triggered refresh
 * can never disagree with what the scheduled sync would have done. Battery/
 * gateway status otherwise only updates on a real unlock webhook event or
 * once a day, which left Admin showing stale numbers whenever someone
 * needed a current reading right now (e.g. investigating a "door not
 * working" report).
 */
export async function POST() {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const results = await syncAllUnitLocks();
  await logAudit(user.id, "ttlock.refresh", "Unit", undefined, { results });
  return NextResponse.json({ results });
}
