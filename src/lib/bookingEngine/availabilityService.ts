import { prisma } from "@/lib/prisma";
import { bookingsConflict } from "@/lib/stayRange";

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
    where: { unitId: query.unitId, cancelledAt: null, ...(opts?.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}) },
    select: { stayType: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true },
  });
  const conflict = unitBookings.some((b) => bookingsConflict({ stayType: query.stayType, date, checkOutDate, checkInTime: query.checkInTime, checkOutTime: query.checkOutTime }, b));
  return { available: !conflict };
}

/** Availability across every given unit for the same date range — powers the guest-facing search/listing grid ("which of these 5 units are free for these dates"). */
export async function checkAvailabilityForUnits(
  unitIds: string[],
  range: { date: string | Date; checkOutDate?: string | Date | null; stayType: StayType; checkInTime?: string | null; checkOutTime?: string | null }
): Promise<Record<string, boolean>> {
  const date = new Date(range.date);
  const checkOutDate = range.checkOutDate ? new Date(range.checkOutDate) : null;
  const allBookings = await prisma.booking.findMany({
    where: { unitId: { in: unitIds }, cancelledAt: null },
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
