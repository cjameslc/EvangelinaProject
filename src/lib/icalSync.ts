import { prisma, type PrismaTransactionClient } from "@/lib/prisma";
import { parseICS } from "@/lib/ical";
import { nightsFor, getOccupiedWindow, lastOccupiedDay, bookingsConflict } from "@/lib/calendarMirror";
import { AIRBNB_NIGHTLY_RATE, AIRBNB_DEFAULT_TIMES } from "@/lib/constants";

/** Same upsert syncCalendarMirror does, but against a transaction's own `tx`
 * client instead of the outer `prisma` singleton — so a booking write and
 * its calendar-mirror row always land together. Kept local to this file
 * rather than threading a client param through the shared helper, which
 * every other call site (create/edit) still calls plainly. */
async function mirrorCalendarBlockTx(tx: PrismaTransactionClient, booking: { id: string; unitId: string; stayType: string; date: Date; checkOutDate: Date | null; checkInTime?: string | null; checkOutTime?: string | null; platform?: string; guests: string[] }) {
  const window = getOccupiedWindow(booking);
  const endDate = lastOccupiedDay(window);
  const guest = booking.guests.join(", ") || "Guest";
  await tx.calendarBlock.upsert({
    where: { bookingId: booking.id },
    update: { unitId: booking.unitId, type: booking.stayType as any, date: booking.date, endDate, guest },
    create: { unitId: booking.unitId, type: booking.stayType as any, date: booking.date, endDate, guest, status: "confirmed", bookingId: booking.id },
  });
}

/** Airbnb .ics events carry no price — revenue is nights x the fixed per-night rate. DTEND is exclusive, so this is exact. */
function airbnbRevenue(start: Date, end: Date): number {
  return nightsFor("Full", start, end) * AIRBNB_NIGHTLY_RATE;
}

/**
 * Re-runs the overlap check against the transaction's own live view, right
 * before the write. The `others` snapshot the sync loop fetched at the top
 * of doSync() can be seconds-to-minutes stale by the time a given event's
 * transaction actually runs (the loop processes every event in the feed
 * sequentially) — a manual booking created in that window is invisible to
 * the stale snapshot, so without this re-check both rows could land and
 * genuinely overlap. Manual/edit booking creation already re-checks inside
 * its own transaction (see bookingService.ts) — this brings the sync path
 * to the same standard.
 */
async function overlapsManualTx(
  tx: PrismaTransactionClient,
  unitId: string,
  evAsBooking: { stayType: string; date: Date; checkOutDate: Date | null; checkInTime: string; checkOutTime: string }
): Promise<boolean> {
  const others = await tx.booking.findMany({
    where: { unitId, source: { not: "AIRBNB" }, cancelledAt: null },
    select: { date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true },
  });
  return others.some((o) => bookingsConflict(evAsBooking, o));
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
 * Airbnb no longer lists, and refuses to accept (never silently
 * double-books) anything that really overlaps — by actual check-in/
 * check-out timestamp, not just calendar day — an existing manual/website/
 * admin booking. A rejected reservation is retried on every future sync
 * until the conflict is resolved on one side.
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

  const [unitTrackedImports, ownerWideImports, others] = await Promise.all([
    // Scoped to THIS unit only — the right scope for staleness: "did this
    // unit's own live feed drop a UID it used to carry."
    prisma.booking.findMany({
      where: { unitId, source: "AIRBNB" },
      select: { id: true, externalUid: true },
    }),
    // Scoped to the whole owner, not just this unit — a booking staff
    // manually reassigned to a sibling unit (via the "suggest available
    // unit" action, see availabilityService.ts's suggestAlternateUnits) no
    // longer has unitId === unitId here, but its externalUid must still be
    // recognized as "already imported," or this loop would treat it as
    // never-seen and recreate a duplicate at the original unit on every
    // future sync. Cross-owner isolation still holds — never queries
    // outside unit.ownerId.
    prisma.booking.findMany({
      where: { unit: { ownerId: unit.ownerId }, source: "AIRBNB" },
      select: { id: true, unitId: true, externalUid: true, date: true, checkOutDate: true, amount: true, paid: true, conflict: true },
    }),
    prisma.booking.findMany({
      // cancelledAt: null was missing — a cancelled manual booking was
      // still treated as occupying the unit, permanently blocking a real
      // Airbnb reservation for those same dates from ever importing.
      where: { unitId, source: { not: "AIRBNB" }, cancelledAt: null },
      select: { date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true },
    }),
  ]);
  const existingImported = ownerWideImports;

  let imported = 0, updated = 0, removed = 0, conflicts = 0;

  // Airbnb no longer lists these — the guest cancelled or the block was
  // removed upstream, so drop our copy too. One batched deleteMany instead
  // of a per-row delete in a loop; CalendarBlock.bookingId is onDelete:
  // Cascade, so each mirror row goes with its booking either way.
  // Deliberately scoped to unitTrackedImports (this unit's own feed), not
  // ownerWideImports — a booking reassigned to a sibling unit is invisible
  // to this query and so never gets swept up here even if it's since
  // become stale; known limitation, see the reassignment note above.
  const staleIds = unitTrackedImports.filter((b) => !b.externalUid || !feedUids.has(b.externalUid)).map((b) => b.id);
  if (staleIds.length > 0) {
    await prisma.booking.deleteMany({ where: { id: { in: staleIds } } });
    removed = staleIds.length;
  }

  for (const ev of activeEvents) {
    // Real check-in/check-out timestamps, not just calendar days — a manual
    // booking checking out 16:00 and an Airbnb import checking in 14:00 the
    // same nominal day are calendar-day-adjacent (not "overlapping" under a
    // whole-day range comparison) but genuinely double-book the unit for 2
    // real hours. bookingsConflict is this app's one real source of truth
    // for "do these two bookings actually overlap" (see its doc comment in
    // stayRange.ts) — this used to reimplement its own, older, day-only
    // version of that check, which is exactly the class of bug already fixed
    // there for manually-created bookings but never carried over here.
    const evAsBooking = { stayType: "Full", date: ev.start, checkOutDate: ev.end, checkInTime: AIRBNB_DEFAULT_TIMES.checkInTime, checkOutTime: AIRBNB_DEFAULT_TIMES.checkOutTime };
    const overlapsManual = others.some((o) => bookingsConflict(evAsBooking, o));
    const existing = existingImported.find((b) => b.externalUid === ev.uid);

    if (existing) {
      // Staff already resolved this one by hand — moved it off its
      // original Airbnb-listing unit onto a sibling unit with real
      // availability (see the reassign-unit route). It no longer occupies
      // THIS unit at all, so this unit's own conflict/date/revenue state has
      // nothing further to say about it — re-running the checks below
      // would incorrectly re-flag it as conflicting against a unit it no
      // longer sits on. Leave it exactly as staff set it.
      if (existing.unitId !== unitId) continue;

      if (overlapsManual) {
        // Never move an already-imported booking onto dates that would
        // create a real double-booking — leave it exactly where it last
        // synced instead of following Airbnb onto the conflicting dates.
        // Every sync re-checks this, so once the conflicting manual booking
        // is edited/cancelled (or the Airbnb reservation itself is
        // cancelled upstream, which the staleIds cleanup above handles),
        // the very next sync accepts the real dates automatically — no
        // manual re-import needed once it's actually resolved.
        if (!existing.conflict) await prisma.booking.update({ where: { id: existing.id }, data: { conflict: true } });
        conflicts++;
        continue;
      }
      const dateChanged = existing.date.getTime() !== ev.start.getTime() || (existing.checkOutDate?.getTime() ?? null) !== ev.end.getTime();
      const revenue = airbnbRevenue(ev.start, ev.end);
      // Also backfills bookings imported before automatic revenue detection
      // existed (amount stuck at 0) even when their dates haven't moved —
      // otherwise they'd never pick up a price until Airbnb happened to
      // change something.
      const revenueStale = existing.amount !== revenue || !existing.paid;
      if (dateChanged || existing.conflict || revenueStale) {
        // Booking write + its calendar-mirror upsert, atomically — a timeout
        // between the two used to be able to leave a booking's dates moved
        // with the calendar still showing the old ones (or vice versa) until
        // the next sync happened to touch it again.
        const raceConflict = await prisma.$transaction(async (tx) => {
          // Re-check against the transaction's own live view — a manual
          // booking created after this sync's outer snapshot but before
          // this transaction runs would otherwise be invisible here.
          if (await overlapsManualTx(tx, unitId, evAsBooking)) {
            await tx.booking.update({ where: { id: existing.id }, data: { conflict: true } });
            return true;
          }
          const booking = await tx.booking.update({
            where: { id: existing.id },
            // Dates moved (a guest's stay got modified upstream) — recompute
            // revenue from the new night count so it never drifts from what's
            // actually on the calendar. conflict is always false here —
            // the overlapsManual branch above already handled (and
            // continue'd past) the true case.
            data: { date: ev.start, checkOutDate: ev.end, conflict: false, amount: revenue, paid: true },
          });
          await mirrorCalendarBlockTx(tx, booking);
          return false;
        });
        if (raceConflict) conflicts++;
        else if (dateChanged) updated++;
      }
      continue;
    }

    // A brand-new Airbnb reservation that overlaps an existing manual/
    // website booking's *real* check-in/check-out times (not just calendar
    // days — see bookingsConflict above) is a genuine double-booking, e.g.
    // a guest paying for a 4pm late checkout while Airbnb's own default
    // check-in is 2pm the same day. Airbnb has no visibility into our local
    // bookings (sync is one-way, in), so it already confirmed this
    // reservation and took the guest's money — refusing to import it here
    // doesn't undo that, it only hides a real, paying, already-confirmed
    // guest from staff. So: always import it, flagged conflict:true (the
    // same flag/badge already used for an already-imported booking that
    // develops a conflict) so it's visible and actionable in the Bookings
    // tab instead of silently missing. Every sync re-evaluates this flag,
    // so once the conflicting side is actually resolved, the next sync
    // clears it automatically.
    //
    // Airbnb collects payment off-platform and remits it directly, so an
    // imported booking counts as paid revenue as soon as it's synced — there's
    // no local payment step for staff to log.
    const conflictNow = await prisma.$transaction(async (tx) => {
      // Re-check against the transaction's own live view — the outer
      // overlapsManual above was computed from a snapshot fetched once at
      // the top of this sync run, which can be stale by the time this
      // specific event's transaction actually executes (events are
      // processed one at a time). Without this, a manual booking created
      // in that window wouldn't be reflected in this booking's initial
      // conflict flag.
      const stillConflicts = overlapsManual || (await overlapsManualTx(tx, unitId, evAsBooking));
      const booking = await tx.booking.create({
        data: {
          unitId,
          date: ev.start,
          checkOutDate: ev.end,
          stayType: "Full",
          checkInTime: AIRBNB_DEFAULT_TIMES.checkInTime,
          checkOutTime: AIRBNB_DEFAULT_TIMES.checkOutTime,
          guests: ["Airbnb guest"] as any,
          contactNumber: "",
          platform: "Airbnb",
          amount: airbnbRevenue(ev.start, ev.end),
          paid: true,
          source: "AIRBNB",
          externalUid: ev.uid,
          conflict: stillConflicts,
        },
      });
      await mirrorCalendarBlockTx(tx, booking);
      return stillConflicts;
    });
    if (conflictNow) conflicts++;
    else imported++;
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
