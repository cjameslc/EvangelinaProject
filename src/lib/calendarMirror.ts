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
