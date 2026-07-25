import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { warmUnsplashCache } from "@/lib/unsplash/service";

// Manual "refresh now" — same role as iCal's "Sync now" button: the cron
// (piggybacked on /api/ical/cron) is the background catch-up, this is the
// fast path for populating/refreshing the cache immediately (initial
// setup, or after changing categories) without waiting for the next
// scheduled run. OWNER_ADMIN-only, matching every other manual-sync action.
export const maxDuration = 60;

export async function POST() {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const results = await warmUnsplashCache();
  return NextResponse.json({ results });
}
