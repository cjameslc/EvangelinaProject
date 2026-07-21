import { prisma } from "@/lib/prisma";
import { bookingsConflict } from "@/lib/stayRange";

export type StayType = "Daycation" | "Night" | "Full";

export type AvailabilityQuery = {
  unitId: string;
  date: string | Date;
  checkOutDate?: string | Date | null;
  stayType: StayType;
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
  opts?: { excludeBookingId?: string }
): Promise<{ available: boolean }> {
  const date = new Date(query.date);
  const checkOutDate = query.checkOutDate ? new Date(query.checkOutDate) : null;
  const unitBookings = await prisma.booking.findMany({
    where: { unitId: query.unitId, ...(opts?.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}) },
    select: { stayType: true, date: true, checkOutDate: true },
  });
  const conflict = unitBookings.some((b) => bookingsConflict({ stayType: query.stayType, date, checkOutDate }, b));
  return { available: !conflict };
}

/** Availability across every given unit for the same date range — powers the guest-facing search/listing grid ("which of these 5 units are free for these dates"). */
export async function checkAvailabilityForUnits(
  unitIds: string[],
  range: { date: string | Date; checkOutDate?: string | Date | null; stayType: StayType }
): Promise<Record<string, boolean>> {
  const results = await Promise.all(
    unitIds.map(async (unitId) => [unitId, (await checkAvailability({ unitId, ...range })).available] as const)
  );
  return Object.fromEntries(results);
}
