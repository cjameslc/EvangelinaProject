import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/bookingEngine/notificationService";
import { analyzePaymentScreenshot } from "@/lib/ai/paymentVerification";
import { releaseAccessCodeForBooking } from "@/lib/access/service";
import { manilaTodayISO } from "@/lib/manilaTime";

// proofUrl/dpProofUrl deliberately excluded — they're base64 data-URLs (a
// real payment screenshot, not a Blob URL), and this select backs
// getGuestBookings(), a guest's ENTIRE booking history, unbounded. Neither
// the /my-bookings list page nor the AI assistant context (both consumers
// of getGuestBookings) ever render or reference these fields — only
// guideBookingSelect below, which backs the single-booking detail page,
// actually needs them (BookingDetailClient checks them for truthiness to
// decide whether to show the "upload proof" prompt). Pulling a real
// receipt image out of Turso for every past booking just to discard it
// unread was pure waste that grows with a guest's booking count.
const publicBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, checkInTime: true, stayType: true,
  guests: true, pax: true, amount: true, dpAmount: true, paid: true, platform: true, specialRequest: true,
  checkedInAt: true, checkedOutAt: true, cancelledAt: true, createdAt: true,
  confirmationNumber: true, confirmationOverrideUntil: true, originalAmount: true, discountPct: true, paymentType: true, intendedDpAmount: true,
  paymentVerificationStatus: true, paymentVerificationNote: true, couponCode: true, couponDiscountAmount: true,
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

// The single-booking detail page (my-bookings/[id]) is now a tabbed
// Guidebook + Booking experience, so it needs the union of both: everything
// publicBookingSelect has (payment/invoice fields for the Booking tab) plus
// the sensitive per-unit guide fields (WiFi/door code/check-in instructions
// — deliberately NOT part of publicBookingSelect, since that one also backs
// the booking LIST page, which has no business surfacing a door code).
// Exported for /admin/view-as-guest/[bookingId] — a staff-only QA preview
// that fetches a chosen booking directly (unscoped by guestId, since
// staff isn't "logged in as" any guest), but needs the exact same field
// shape so GuestBookingHub/GuidebookView/BookingDetailClient render
// identically to the real guest experience.
export const guideBookingSelect = {
  ...publicBookingSelect,
  // Re-added here specifically — publicBookingSelect deliberately excludes
  // these (see its own comment); this select is always for exactly one
  // booking (the guide/detail view), not a whole history, so the cost
  // publicBookingSelect is avoiding doesn't apply here.
  proofUrl: true, dpProofUrl: true,
  unit: {
    select: {
      id: true, name: true, shortName: true, unitNumber: true, photoUrl: true, location: true, ownerId: true,
      wifiSsid: true, wifiPassword: true, doorCode: true, checkInInstructions: true, checkOutInstructions: true, videoTutorialUrl: true,
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
 * The security-sensitive Guide pages (WiFi/Check-in/Checkout — see
 * src/app/guide/wifi etc.) have no bookingId in their URL, unlike
 * /my-bookings/[id], so they resolve "which unit's secrets do I show this
 * guest" via this lookup instead: their nearest non-cancelled booking whose
 * stay hasn't ended yet. Booking.date/checkOutDate are UTC-midnight-stamped
 * calendar days (see fmtDate's {timeZone:"UTC"} usage elsewhere), so the
 * cutoff below is today's Manila calendar date at UTC midnight to match
 * that same convention — never a real "now" timestamp. A booking with no
 * checkOutDate (Daycation/same-day) is active through the end of its own
 * check-in day. Once a stay has fully ended this deliberately returns
 * nothing rather than falling back to a past booking — no reason to keep
 * surfacing a door code after checkout.
 */
export async function getActiveGuideBooking(guestId: string) {
  const todayUTCMidnight = new Date(`${manilaTodayISO()}T00:00:00.000Z`);
  return prisma.booking.findFirst({
    where: {
      guestId,
      cancelledAt: null,
      OR: [{ checkOutDate: { gte: todayUTCMidnight } }, { checkOutDate: null, date: { gte: todayUTCMidnight } }],
    },
    orderBy: { date: "asc" },
    select: guideBookingSelect,
  });
}

/**
 * Which owner's business this guest actually belongs to — their most
 * recent booking's unit, regardless of whether that stay is still active.
 * Used to scope the general "about this business" content (guidebook
 * categories/amenities/house rules, AI Concierge context) to the guest's
 * own host, since getGuidebookSettings/buildAssistantContext otherwise
 * silently default to Evangelina's (see getDefaultOwnerId's doc comment)
 * — a real cross-tenant leak the moment a guest belongs to a different
 * owner. A guest with no bookings yet (shouldn't normally happen — the
 * guest record itself is only ever created alongside a first booking, or
 * via guest-login against an existing one) returns null and callers fall
 * back to the default owner.
 */
export async function getGuestOwnerId(guestId: string): Promise<string | null> {
  const booking = await prisma.booking.findFirst({
    where: { guestId },
    orderBy: { createdAt: "desc" },
    select: { unit: { select: { ownerId: true } } },
  });
  return booking?.unit.ownerId ?? null;
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
  releaseAccessCodeForBooking(bookingId).catch(() => {});
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
const GUEST_REQUEST_PRIORITIES = ["normal", "high", "urgent"] as const;

export async function createGuestRequest(
  guestId: string,
  bookingId: string,
  type: string,
  message: string | null,
  photoUrl: string | null = null,
  priority: string = "normal"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(GUEST_REQUEST_TYPES as readonly string[]).includes(type)) return { ok: false, error: "Invalid request type." };
  const safePriority = (GUEST_REQUEST_PRIORITIES as readonly string[]).includes(priority) ? priority : "normal";
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, guestId }, select: { id: true, unitId: true, cancelledAt: true } });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.cancelledAt) return { ok: false, error: "This booking is cancelled." };

  await prisma.guestRequest.create({
    data: { guestId, bookingId, unitId: booking.unitId, type, message: message?.trim() || null, photoUrl, priority: safePriority },
  });
  return { ok: true };
}
