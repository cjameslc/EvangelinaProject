import { prisma } from "@/lib/prisma";
import { bookingsConflict, occupiedRange } from "@/lib/stayRange";

// The extended `prisma` client's own $transaction callback parameter type —
// derived structurally instead of Prisma's generic Prisma.TransactionClient,
// since this app's client has extensions (json-string-fields) applied that
// change its shape.
type DbClient = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type StayType = "Daycation" | "Night" | "Full" | "Flexible";

export type AvailabilityQuery = {
  unitId: string;
  date: string | Date;
  checkOutDate?: string | Date | null;
  stayType: StayType;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

/**
 * A provably-safe superset of "every booking that could possibly conflict
 * with this request," used to bound the findMany below instead of fetching
 * a unit's entire booking history. Built from the exact same occupiedRange()
 * bookingsConflict() itself calls internally, so the SQL bound and the
 * in-memory conflict decision can never disagree about what a stay type
 * occupies — only the SQL bound narrows *how many* rows get that decision
 * applied to them, it never decides a conflict itself.
 *
 * Two branches, both anchored on the request's own occupied range
 * [reqStart, reqEnd):
 *  1. Existing booking's `date` falls in/near that range — the direct-
 *     overlap case (padded ±1 day, see below).
 *  2. Existing booking's `date` is earlier, but its `checkOutDate` reaches
 *     into the range — a longer-running stay that started before the
 *     window but hasn't checked out yet. No cap on how far back `date` can
 *     be here: a booking can legitimately (or via typo/guest-submitted far-
 *     future checkout) span weeks or months, so this branch is deliberately
 *     NOT bounded on the low end of `date` — only `checkOutDate` matters
 *     for it. Same shape as the existing "is this booking still active"
 *     query in guestService.ts's getActiveGuideBooking.
 *
 * The ±1 day pad on branch 1's window exists because bookingsConflict has
 * an exact-adjacency fallback (stayRange.ts: two bookings whose day-ranges
 * merely touch — one's checkout day is the other's check-in day — still
 * get a real-timestamp overlap check). Without the pad, a booking starting
 * exactly on reqEnd (or ending exactly on reqStart) would be excluded from
 * the candidate set before that fallback ever gets a chance to run.
 */
function conflictCandidateWhere(stayType: StayType, date: Date, checkOutDate: Date | null) {
  const { start: reqStart, end: reqEnd } = occupiedRange(stayType, date, checkOutDate);
  const winStart = new Date(reqStart.getTime() - 86400000);
  const winEnd = new Date(reqEnd.getTime() + 86400000);
  return {
    OR: [
      { date: { gte: winStart, lt: winEnd } },
      { date: { lt: winStart }, checkOutDate: { gte: winStart } },
    ],
  };
}

/**
 * The single availability check for the whole app — same conflict math
 * (bookingsConflict/occupiedRange in stayRange.ts) previously inlined
 * separately in bookingService.ts's createBookingRecord and the booking
 * PATCH route. Both now call this instead of re-querying, so there is
 * exactly one implementation of "is this unit free for these dates."
 *
 * Deliberately does NOT factor in housekeeping/cleaning status — a room
 * being dirty doesn't make it unbookable, it just needs cleaning before the
 * next guest arrives (Housekeeping's own "needs cleaning before next guest"
 * signal on the Dashboard already covers that separately).
 */
export async function checkAvailability(
  query: AvailabilityQuery,
  opts?: { excludeBookingId?: string; client?: DbClient }
): Promise<{ available: boolean }> {
  const db = opts?.client ?? prisma;
  const date = new Date(query.date);
  const checkOutDate = query.checkOutDate ? new Date(query.checkOutDate) : null;
  const unitBookings = await db.booking.findMany({
    // A guest-cancelled booking (cancelledAt set) must not keep blocking the
    // unit — otherwise a cancelled date range is stuck unbookable forever.
    // The OR clause bounds this to a safe superset of possibly-conflicting
    // bookings instead of the unit's entire history — see
    // conflictCandidateWhere's doc comment for why it's safe.
    where: {
      unitId: query.unitId,
      cancelledAt: null,
      ...conflictCandidateWhere(query.stayType, date, checkOutDate),
      ...(opts?.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
    },
    select: { stayType: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true },
  });
  const conflict = unitBookings.some((b) => bookingsConflict({ stayType: query.stayType, date, checkOutDate, checkInTime: query.checkInTime, checkOutTime: query.checkOutTime }, b));
  return { available: !conflict };
}

/**
 * Which of a booking's *sibling* units (same owner, active, excluding its
 * current unit) could take it without a conflict — powers the Bookings
 * tab's "suggest an available unit" action on a flagged conflict. Airbnb
 * has no visibility into this app's local bookings (sync is one-way, in
 * only), so it can and does confirm a reservation that collides with one
 * already on the books here (see icalSync.ts's conflict-on-import
 * handling) — staff need a fast way to see where else the guest could
 * actually go, since Airbnb having already committed to the guest doesn't
 * go away just because we flag it.
 */
export async function suggestAlternateUnits(bookingId: string): Promise<{ id: string; name: string; shortName: string; unitNumber: string }[]> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      unitId: true, date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true,
      unit: { select: { ownerId: true } },
    },
  });
  if (!booking) return [];
  const siblings = await prisma.unit.findMany({
    where: { ownerId: booking.unit.ownerId, active: true, id: { not: booking.unitId } },
    select: { id: true, name: true, shortName: true, unitNumber: true },
  });
  if (siblings.length === 0) return [];
  const availability = await checkAvailabilityForUnits(siblings.map((u) => u.id), {
    date: booking.date,
    checkOutDate: booking.checkOutDate,
    stayType: booking.stayType as StayType,
    checkInTime: booking.checkInTime,
    checkOutTime: booking.checkOutTime,
  });
  return siblings.filter((u) => availability[u.id]);
}

/** Availability across every given unit for the same date range — powers the guest-facing search/listing grid ("which of these 5 units are free for these dates"). */
export async function checkAvailabilityForUnits(
  unitIds: string[],
  range: { date: string | Date; checkOutDate?: string | Date | null; stayType: StayType; checkInTime?: string | null; checkOutTime?: string | null }
): Promise<Record<string, boolean>> {
  const date = new Date(range.date);
  const checkOutDate = range.checkOutDate ? new Date(range.checkOutDate) : null;
  const allBookings = await prisma.booking.findMany({
    where: {
      unitId: { in: unitIds },
      cancelledAt: null,
      ...conflictCandidateWhere(range.stayType, date, checkOutDate),
    },
    select: { unitId: true, stayType: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true },
  });
  const byUnit = new Map<string, typeof allBookings>();
  for (const b of allBookings) {
    const list = byUnit.get(b.unitId);
    if (list) list.push(b);
    else byUnit.set(b.unitId, [b]);
  }
  return Object.fromEntries(
    unitIds.map((unitId) => {
      const conflict = (byUnit.get(unitId) ?? []).some((b) => bookingsConflict({ stayType: range.stayType, date, checkOutDate, checkInTime: range.checkInTime, checkOutTime: range.checkOutTime }, b));
      return [unitId, !conflict];
    })
  );
}
