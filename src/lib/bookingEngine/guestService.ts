import { prisma } from "@/lib/prisma";

const publicBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, checkInTime: true, stayType: true,
  guests: true, pax: true, amount: true, dpAmount: true, paid: true, platform: true, specialRequest: true,
  checkedInAt: true, checkedOutAt: true, createdAt: true,
  unit: { select: { id: true, name: true, shortName: true, unitNumber: true, photoUrl: true, location: true } },
} as const;

export async function findOrCreateGuestByEmail(email: string, name?: string | null) {
  const normalized = email.trim().toLowerCase();
  return prisma.guest.upsert({
    where: { email: normalized },
    update: name ? { name } : {},
    create: { email: normalized, name: name ?? null },
  });
}

export async function getGuestBookings(guestId: string) {
  return prisma.booking.findMany({
    where: { guestId },
    orderBy: { date: "desc" },
    select: publicBookingSelect,
  });
}

export async function getGuestBooking(guestId: string, bookingId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, guestId },
    select: publicBookingSelect,
  });
}
