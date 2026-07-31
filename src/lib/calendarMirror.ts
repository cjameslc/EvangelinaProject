import { prisma } from "@/lib/prisma";
import { getOccupiedWindow, lastOccupiedDay } from "@/lib/stayRange";

// The pure date-range math lives in stayRange.ts (no Prisma import, so it's
// safe for client components too) — re-exported here so existing server-side
// imports of these names from "@/lib/calendarMirror" keep working unchanged.
export {
  calendarBlockEndDate, occupiedRange, nightsFor, rangesOverlap, bookingsConflict,
  getOccupiedWindow, windowsOverlap, lastOccupiedDay,
} from "@/lib/stayRange";

type MirrorableBooking = {
  id: string;
  unitId: string;
  stayType: string;
  date: Date;
  checkOutDate: Date | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  platform?: string;
  guests: string[];
};

/** Creates or updates the mirrored CalendarBlock for a Booking, so /calendar always reflects its current date(s) — used on create, edit, and import sync alike.
 * endDate is the INCLUSIVE last occupied calendar day, derived from the
 * booking's real check-in/check-out timestamps (getOccupiedWindow) rather
 * than trusting checkOutDate as-is — this is what lets a Flexible booking
 * that crosses midnight (or any stay whose actual checkout time falls later
 * in its checkout day) correctly show that day as occupied, matching what
 * the real conflict guard (bookingsConflict) now also enforces. */
export async function syncCalendarMirror(booking: MirrorableBooking) {
  const window = getOccupiedWindow(booking);
  const endDate = lastOccupiedDay(window);
  const guest = booking.guests.join(", ") || "Guest";
  await prisma.calendarBlock.upsert({
    where: { bookingId: booking.id },
    update: { unitId: booking.unitId, type: booking.stayType as any, date: booking.date, endDate, guest },
    create: { unitId: booking.unitId, type: booking.stayType as any, date: booking.date, endDate, guest, status: "confirmed", bookingId: booking.id },
  });
}

// Mirrors a unit's live "cleaning in progress" state onto the calendar as a
// Cleaning-type CalendarBlock, so /calendar shows it immediately — the same
// mirroring idea as syncCalendarMirror above. When a bookingId is known
// (which checkout this clean is for), it's keyed off cleaningBookingId — a
// unique column — so repeated Start/Finish cycles for the SAME checkout
// upsert one row instead of piling up duplicate tiles. Without a bookingId
// (legacy call sites, or a clean not tied to any specific checkout) it falls
// back to the old "currently open block for this unit" behavior.

/** Called when a housekeeper clicks "Start cleaning" — opens a new Cleaning
 * block dated `startedAt`, left open-ended until the clean finishes. Clears
 * any other stale open block for this unit first (e.g. a previous session
 * reset without finishing, or a different checkout) so a unit never shows
 * two overlapping "cleaning" bars. */
export async function openCleaningCalendarBlock(unitId: string, startedAt: Date, bookingId?: string | null) {
  const staleOpen = await prisma.calendarBlock.findMany({
    where: { unitId, type: "Cleaning", endDate: null },
    select: { id: true, cleaningBookingId: true },
  });
  const staleIds = staleOpen.filter((b) => !bookingId || b.cleaningBookingId !== bookingId).map((b) => b.id);
  if (staleIds.length) await prisma.calendarBlock.deleteMany({ where: { id: { in: staleIds } } });

  if (bookingId) {
    await prisma.calendarBlock.upsert({
      where: { cleaningBookingId: bookingId },
      update: { date: startedAt, endDate: null, guest: "Cleaning in progress", status: "confirmed" },
      create: { unitId, type: "Cleaning", date: startedAt, endDate: null, guest: "Cleaning in progress", status: "confirmed", cleaningBookingId: bookingId },
    });
  } else {
    await prisma.calendarBlock.create({
      data: { unitId, type: "Cleaning", date: startedAt, endDate: null, guest: "Cleaning in progress", status: "confirmed" },
    });
  }
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
