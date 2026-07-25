import { prisma } from "@/lib/prisma";

/** Real booking data for a rich card — nothing fabricated, same fields the
 * Bookings list itself shows. Returns null for an unknown/mistyped ref
 * rather than throwing, so a chat message with a typo'd booking number
 * just renders as plain text instead of an error. */
export async function getBookingCard(confirmationNumber: string) {
  const booking = await prisma.booking.findUnique({
    where: { confirmationNumber },
    select: {
      id: true, confirmationNumber: true, guests: true, date: true, checkOutDate: true, stayType: true,
      platform: true, amount: true, dpAmount: true, paid: true, cancelledAt: true, checkedInAt: true, checkedOutAt: true,
      unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
    },
  });
  if (!booking) return null;
  const status = booking.cancelledAt ? "Cancelled" : booking.checkedOutAt ? "Checked out" : booking.checkedInAt ? "Checked in" : booking.paid ? "Paid" : "Unpaid";
  return {
    id: booking.id,
    confirmationNumber: booking.confirmationNumber,
    guest: booking.guests[0] ?? "Guest",
    unit: booking.unit.shortName,
    unitNumber: booking.unit.unitNumber,
    checkIn: booking.date.toISOString(),
    checkOut: booking.checkOutDate?.toISOString() ?? null,
    stayType: booking.stayType,
    platform: booking.platform,
    status,
    total: booking.amount + (booking.dpAmount ?? 0),
  };
}
