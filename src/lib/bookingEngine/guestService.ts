import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/bookingEngine/notificationService";

const publicBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, checkInTime: true, stayType: true,
  guests: true, pax: true, amount: true, dpAmount: true, paid: true, platform: true, specialRequest: true,
  checkedInAt: true, checkedOutAt: true, cancelledAt: true, proofUrl: true, dpProofUrl: true, createdAt: true,
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

/**
 * Guest-initiated cancellation policy — deliberately simple since no
 * cancellation rule existed anywhere in this app before: cancellable up
 * until check-in, and only once. Sets cancelledAt rather than deleting the
 * row, so the guest still sees it in their booking history afterward.
 */
export async function cancelGuestBooking(guestId: string, bookingId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, guestId }, select: { id: true, date: true, cancelledAt: true } });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.cancelledAt) return { ok: false, error: "This booking is already cancelled." };
  if (new Date(booking.date) <= new Date()) return { ok: false, error: "This stay has already started — contact us to cancel." };

  await prisma.booking.update({ where: { id: bookingId }, data: { cancelledAt: new Date() } });
  await notify({ type: "booking.cancelled", bookingId });
  return { ok: true };
}

export async function updateGuestProfile(guestId: string, data: { name?: string; phone?: string; emailNotifications?: boolean }) {
  return prisma.guest.update({ where: { id: guestId }, data });
}

export async function getGuestProfile(guestId: string) {
  return prisma.guest.findUnique({ where: { id: guestId }, select: { id: true, email: true, name: true, phone: true, emailNotifications: true } });
}

export async function setGuestPaymentProof(guestId: string, bookingId: string, field: "proofUrl" | "dpProofUrl", url: string) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, guestId }, select: { id: true } });
  if (!booking) return { ok: false as const, error: "Booking not found." };
  await prisma.booking.update({ where: { id: bookingId }, data: { [field]: url } });
  return { ok: true as const };
}
