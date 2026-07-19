import { NextResponse } from "next/server";
import { requireUser, logAudit } from "@/lib/session";
import { syncAllUnitsFromAirbnb } from "@/lib/icalSync";

// Manual "Sync all" trigger for the Calendar page — every fetch inside
// syncAllUnitsFromAirbnb hits Airbnb live (no caching), so this always pulls
// whatever's on Airbnb right now rather than waiting for the once-daily cron.
export async function POST() {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const results = await syncAllUnitsFromAirbnb("MANUAL");
  const summary = results.map((r) => ({ unit: r.unit, ...r.result }));
  await logAudit(user.id, "unit.ical_sync_all", "Unit", undefined, { synced: results.length, summary });
  return NextResponse.json({ synced: results.length, results: summary });
}
