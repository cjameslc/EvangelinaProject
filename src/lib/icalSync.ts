import { prisma } from "@/lib/prisma";
import { parseICS } from "@/lib/ical";
import { calendarBlockEndDate, syncCalendarMirror, rangesOverlap, nightsFor } from "@/lib/calendarMirror";
import { AIRBNB_NIGHTLY_RATE } from "@/lib/constants";

/** Airbnb .ics events carry no price — revenue is nights x the fixed per-night rate. DTEND is exclusive, so this is exact. */
function airbnbRevenue(start: Date, end: Date): number {
  return nightsFor("Full", start, end) * AIRBNB_NIGHTLY_RATE;
}

export type IcalSyncResult = {
  ok: boolean;
  imported: number;
  updated: number;
  removed: number;
  conflicts: number;
  error?: string;
};

async function fetchIcsText(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "EvangelinasStaycation-iCal-Sync/1.0" },
    });
    if (!res.ok) throw new Error(`Feed responded with HTTP ${res.status}`);
    return await res.text();
  } catch (e: any) {
    if (attempt < 2) return fetchIcsText(url, attempt + 1);
    throw new Error(e?.message ?? "Network error fetching the calendar feed.");
  }
}

async function recordSyncError(unitId: string, message: string) {
  console.error(`[ical-sync] unit ${unitId}: ${message}`);
  await prisma.unit.update({ where: { id: unitId }, data: { icalLastSyncAt: new Date(), icalLastSyncError: message } });
}

/**
 * Reconciles a unit's Bookings with its configured Airbnb .ics feed:
 * creates newly-seen blocks, updates ones whose dates moved, removes ones
 * Airbnb no longer lists, and flags (never silently overwrites) anything
 * that overlaps an existing manual/website/admin booking.
 */
export async function syncUnitFromAirbnb(unitId: string, syncType: "AUTOMATIC" | "MANUAL" = "MANUAL"): Promise<IcalSyncResult> {
  const startedAt = new Date();
  const t0 = Date.now();
  const result = await doSync(unitId);
  try {
    await prisma.icalSyncLog.create({
      data: {
        unitId,
        syncType,
        startedAt,
        durationMs: Date.now() - t0,
        imported: result.imported,
        updated: result.updated,
        removed: result.removed,
        conflicts: result.conflicts,
        ok: result.ok,
        error: result.error ?? null,
      },
    });
  } catch (e) {
    // A bad unitId (FK violation) or a transient DB hiccup shouldn't make an
    // otherwise-successful sync look like it failed — the History panel
    // simply won't have a row for this run.
    console.error(`[ical-sync] failed to write sync log for unit ${unitId}:`, e);
  }
  return result;
}

async function doSync(unitId: string): Promise<IcalSyncResult> {
  const empty = { imported: 0, updated: 0, removed: 0, conflicts: 0 };
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) return { ok: false, ...empty, error: "Unit not found." };
  if (!unit.icalImportUrl) return { ok: false, ...empty, error: "No Airbnb import URL configured for this unit." };

  let url: URL;
  try {
    url = new URL(unit.icalImportUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    const msg = "Invalid import URL — must be a valid http(s) link to an .ics feed.";
    await recordSyncError(unitId, msg);
    return { ok: false, ...empty, error: msg };
  }

  let text: string;
  try {
    text = await fetchIcsText(url.toString());
  } catch (e: any) {
    const msg = `Couldn't reach the calendar feed: ${e.message}`;
    await recordSyncError(unitId, msg);
    return { ok: false, ...empty, error: msg };
  }

  let events;
  try {
    events = parseICS(text);
  } catch (e: any) {
    const msg = e?.message ?? "The feed isn't a valid .ics file.";
    await recordSyncError(unitId, msg);
    return { ok: false, ...empty, error: msg };
  }

  // Airbnb's own export has no concept of stay "types" — every real
  // reservation in the feed carries SUMMARY:Reserved. Anything else (e.g.
  // "Airbnb (Not available)" for a host block, or another calendar's
  // synced-in unavailable dates) is a blocked date, not a guest booking, and
  // must never be imported as one — it has no guest, no revenue, and would
  // otherwise inflate paid income and clutter the Bookings list with fake
  // reservations.
  const activeEvents = events.filter((e) => !e.cancelled && e.uid && e.summary.trim().toLowerCase() === "reserved");
  const feedUids = new Set(activeEvents.map((e) => e.uid));

  const [existingImported, others] = await Promise.all([
    prisma.booking.findMany({ where: { unitId, source: "AIRBNB" } }),
    prisma.booking.findMany({
      where: { unitId, source: { not: "AIRBNB" } },
      select: { date: true, checkOutDate: true, stayType: true },
    }),
  ]);

  let imported = 0, updated = 0, removed = 0, conflicts = 0;

  // Airbnb no longer lists these — the guest cancelled or the block was
  // removed upstream, so drop our copy too (cascades to its calendar mirror).
  for (const b of existingImported) {
    if (!b.externalUid || !feedUids.has(b.externalUid)) {
      await prisma.booking.delete({ where: { id: b.id } });
      removed++;
    }
  }

  for (const ev of activeEvents) {
    const overlapsManual = others.some((o) =>
      rangesOverlap(ev.start, ev.end, o.date, calendarBlockEndDate(o.stayType, o.date, o.checkOutDate) ?? new Date(o.date.getTime() + 86400000))
    );
    const existing = existingImported.find((b) => b.externalUid === ev.uid);

    if (existing) {
      const dateChanged = existing.date.getTime() !== ev.start.getTime() || (existing.checkOutDate?.getTime() ?? null) !== ev.end.getTime();
      const revenue = airbnbRevenue(ev.start, ev.end);
      // Also backfills bookings imported before automatic revenue detection
      // existed (amount stuck at 0) even when their dates haven't moved —
      // otherwise they'd never pick up a price until Airbnb happened to
      // change something.
      const revenueStale = existing.amount !== revenue || !existing.paid;
      if (dateChanged || existing.conflict !== overlapsManual || revenueStale) {
        const booking = await prisma.booking.update({
          where: { id: existing.id },
          // Dates moved (a guest's stay got modified upstream) — recompute
          // revenue from the new night count so it never drifts from what's
          // actually on the calendar.
          data: { date: ev.start, checkOutDate: ev.end, conflict: overlapsManual, amount: revenue, paid: true },
        });
        await syncCalendarMirror(booking);
        if (dateChanged) updated++;
      }
      continue;
    }

    // Never overwrite an existing manual/website/admin booking — record the
    // import alongside it, flagged, so an admin can review and resolve it.
    // Airbnb collects payment off-platform and remits it directly, so an
    // imported booking counts as paid revenue as soon as it's synced — there's
    // no local payment step for staff to log.
    const booking = await prisma.booking.create({
      data: {
        unitId,
        date: ev.start,
        checkOutDate: ev.end,
        stayType: "Full",
        guests: ["Airbnb guest"],
        contactNumber: "",
        platform: "Airbnb",
        amount: airbnbRevenue(ev.start, ev.end),
        paid: true,
        source: "AIRBNB",
        externalUid: ev.uid,
        conflict: overlapsManual,
      },
    });
    await syncCalendarMirror(booking);
    imported++;
    if (overlapsManual) conflicts++;
  }

  await prisma.unit.update({ where: { id: unitId }, data: { icalLastSyncAt: new Date(), icalLastSyncError: null } });
  return { ok: true, imported, updated, removed, conflicts };
}

/**
 * Syncs every unit that has an Airbnb .ics feed configured, one at a time
 * (each call does its own live fetch — no caching, so this always reflects
 * whatever Airbnb has right now). Shared by the daily cron and the manual
 * "Sync all" trigger so both hit the exact same per-unit logic.
 */
export async function syncAllUnitsFromAirbnb(syncType: "AUTOMATIC" | "MANUAL" = "MANUAL"): Promise<{ unit: string; unitId: string; result: IcalSyncResult }[]> {
  const units = await prisma.unit.findMany({ where: { icalImportUrl: { not: null } }, select: { id: true, shortName: true } });
  const results = [];
  for (const unit of units) {
    const result = await syncUnitFromAirbnb(unit.id, syncType);
    results.push({ unit: unit.shortName, unitId: unit.id, result });
  }
  return results;
}
