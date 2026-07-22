import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/bookingEngine/notificationService";
import { analyzePaymentScreenshot } from "@/lib/ai/paymentVerification";

const publicBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, checkInTime: true, stayType: true,
  guests: true, pax: true, amount: true, dpAmount: true, paid: true, platform: true, specialRequest: true,
  checkedInAt: true, checkedOutAt: true, cancelledAt: true, proofUrl: true, dpProofUrl: true, createdAt: true,
  confirmationNumber: true, originalAmount: true, discountPct: true, paymentType: true, intendedDpAmount: true,
  paymentVerificationStatus: true, paymentVerificationNote: true,
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

// Door code/WiFi password are sensitive — deliberately not part of
// publicBookingSelect (used by the booking list + detail page), only ever
// fetched here, for the one page that actually needs to show them: the
// Digital Guidebook, and only to the guest who owns this exact booking.
const guideBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, checkInTime: true, stayType: true,
  guests: true, confirmationNumber: true, cancelledAt: true, checkedInAt: true, checkedOutAt: true,
  unit: {
    select: {
      id: true, name: true, shortName: true, unitNumber: true, photoUrl: true, location: true,
      wifiSsid: true, wifiPassword: true, doorCode: true, checkInInstructions: true, videoTutorialUrl: true,
    },
  },
} as const;

export async function getGuestBookingForGuide(guestId: string, bookingId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, guestId },
    select: guideBookingSelect,
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

/**
 * Uploads + AI-checks a payment screenshot in one step. dpAmount/paid are
 * only ever written here, on a confident auto_approved match — never on
 * upload alone. That keeps the existing revenue formula
 * (collectedRevenueCentavos: dpAmount is always "collected") correct with
 * zero special-casing, matching how staff-entered bookings already work.
 */
export async function verifyGuestPaymentProof(
  guestId: string,
  bookingId: string,
  field: "proofUrl" | "dpProofUrl",
  url: string,
  imageBase64: string,
  mimeType: string
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, guestId },
    select: { id: true, amount: true, intendedDpAmount: true },
  });
  if (!booking) return { ok: false as const, error: "Booking not found." };

  const expectedAmount = field === "dpProofUrl" ? (booking.intendedDpAmount ?? 0) : booking.amount;
  const result = await analyzePaymentScreenshot(imageBase64, mimeType, expectedAmount);

  const data: Record<string, unknown> = {
    [field]: url,
    paymentVerificationStatus: result.status,
    paymentVerificationNote: result.note,
  };
  if (result.status === "auto_approved") {
    if (field === "dpProofUrl") {
      data.dpAmount = expectedAmount;
      data.amount = booking.amount - expectedAmount;
    } else {
      data.paid = true;
    }
  }
  await prisma.booking.update({ where: { id: bookingId }, data });
  if (result.status === "auto_approved") await notify({ type: "payment.received", bookingId });

  return { ok: true as const, status: result.status, note: result.note };
}

export async function getGuestNotifications(guestId: string) {
  return prisma.guestNotification.findMany({ where: { guestId }, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function getUnreadNotificationCount(guestId: string) {
  return prisma.guestNotification.count({ where: { guestId, read: false } });
}

export async function markNotificationsRead(guestId: string, ids?: string[]) {
  await prisma.guestNotification.updateMany({
    where: { guestId, read: false, ...(ids ? { id: { in: ids } } : {}) },
    data: { read: true },
  });
}

const GUEST_REQUEST_TYPES = ["housekeeping", "late_checkout", "extend_stay", "issue", "other"] as const;

/** Guest → staff request from the Digital Guidebook — see GuestRequest in
 * schema.prisma. A cancelled booking can't raise a request (nothing to
 * housekeep/extend/check out late on a stay that isn't happening). */
export async function createGuestRequest(
  guestId: string,
  bookingId: string,
  type: string,
  message: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(GUEST_REQUEST_TYPES as readonly string[]).includes(type)) return { ok: false, error: "Invalid request type." };
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, guestId }, select: { id: true, unitId: true, cancelledAt: true } });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.cancelledAt) return { ok: false, error: "This booking is cancelled." };

  await prisma.guestRequest.create({
    data: { guestId, bookingId, unitId: booking.unitId, type, message: message?.trim() || null },
  });
  return { ok: true };
}
