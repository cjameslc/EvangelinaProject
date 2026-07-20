import { prisma } from "@/lib/prisma";
import { calendarBlockEndDate } from "@/lib/stayRange";

// The pure date-range math lives in stayRange.ts (no Prisma import, so it's
// safe for client components too) — re-exported here so existing server-side
// imports of these names from "@/lib/calendarMirror" keep working unchanged.
export { calendarBlockEndDate, occupiedRange, nightsFor, rangesOverlap, bookingsConflict } from "@/lib/stayRange";

type MirrorableBooking = {
  id: string;
  unitId: string;
  stayType: string;
  date: Date;
  checkOutDate: Date | null;
  guests: string[];
};

/** Creates or updates the mirrored CalendarBlock for a Booking, so /calendar always reflects its current date(s) — used on create, edit, and import sync alike. */
export async function syncCalendarMirror(booking: MirrorableBooking) {
  const endDate = calendarBlockEndDate(booking.stayType, booking.date, booking.checkOutDate);
  const guest = booking.guests.join(", ") || "Guest";
  await prisma.calendarBlock.upsert({
    where: { bookingId: booking.id },
    update: { unitId: booking.unitId, type: booking.stayType as any, date: booking.date, endDate, guest },
    create: { unitId: booking.unitId, type: booking.stayType as any, date: booking.date, endDate, guest, status: "confirmed", bookingId: booking.id },
  });
}

// Mirrors a unit's live "cleaning in progress" state onto the calendar as a
// Cleaning-type CalendarBlock, so /calendar shows it immediately — the same
// mirroring idea as syncCalendarMirror above, just keyed off "the currently
// open cleaning block for this unit" (endDate: null) instead of a bookingId,
// since a clean has no Booking row of its own to hang a unique key off.

/** Called when a housekeeper clicks "Start cleaning" — opens a new Cleaning
 * block dated `startedAt`, left open-ended until the clean finishes. Clears
 * any stale open block first (e.g. a previous session reset without
 * finishing) so a unit never shows two overlapping "cleaning" bars. */
export async function openCleaningCalendarBlock(unitId: string, startedAt: Date) {
  await prisma.calendarBlock.deleteMany({ where: { unitId, type: "Cleaning", endDate: null } });
  await prisma.calendarBlock.create({
    data: { unitId, type: "Cleaning", date: startedAt, endDate: null, guest: "Cleaning in progress", status: "confirmed" },
  });
}

/** Called when a housekeeper marks a unit clean — closes off the open
 * Cleaning block with `endedAt`. */
export async function closeCleaningCalendarBlock(unitId: string, endedAt: Date) {
  await prisma.calendarBlock.updateMany({
    where: { unitId, type: "Cleaning", endDate: null },
    data: { endDate: endedAt, guest: "Cleaned" },
  });
}

/** Called when a housekeeper resets a unit back to "to clean" — removes any
 * open Cleaning block, matching HousekeepingUnitState's own reset. */
export async function clearCleaningCalendarBlock(unitId: string) {
  await prisma.calendarBlock.deleteMany({ where: { unitId, type: "Cleaning", endDate: null } });
}
