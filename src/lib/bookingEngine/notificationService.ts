import { prisma } from "@/lib/prisma";

// Every booking-lifecycle event funnels through here — one seam. Persists
// an in-app GuestNotification when the booking belongs to a Guest Portal
// account (guestId set); a no-op for staff-only bookings, which have no
// guest inbox to write to. Real push delivery (the empty push/
// notificationclick stubs already in public/sw.js) plugs in later without
// any caller needing to change — they already all call notify(), not
// "write a row" or "send a push" directly.
export type NotificationEvent =
  | { type: "booking.created"; bookingId: string }
  | { type: "booking.updated"; bookingId: string }
  | { type: "booking.cancelled"; bookingId: string }
  | { type: "payment.received"; bookingId: string }
  | { type: "checkin.reminder"; bookingId: string }
  | { type: "checkout.reminder"; bookingId: string };

const MESSAGES: Record<NotificationEvent["type"], string> = {
  "booking.created": "Your booking request was received.",
  "booking.updated": "Your booking details were updated.",
  "booking.cancelled": "Your booking was cancelled.",
  "payment.received": "We've confirmed your payment.",
  "checkin.reminder": "Your check-in is coming up soon.",
  "checkout.reminder": "Your check-out is coming up soon.",
};

export async function notify(event: NotificationEvent): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[notify] ${event.type}`, event);

  try {
    const booking = await prisma.booking.findUnique({ where: { id: event.bookingId }, select: { guestId: true } });
    if (!booking?.guestId) return;
    await prisma.guestNotification.create({
      data: { guestId: booking.guestId, type: event.type, message: MESSAGES[event.type], bookingId: event.bookingId },
    });
  } catch {
    // A notification failure must never break the booking operation that triggered it.
  }
}
