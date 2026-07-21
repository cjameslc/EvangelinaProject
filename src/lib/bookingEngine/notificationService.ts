// Every booking-lifecycle event funnels through here — one seam, wired to
// nothing but a log line for now. Real delivery (guest email, staff alerts,
// browser push via the stub listeners already in public/sw.js) plugs in
// later without any caller needing to change: they already all call
// notify(), not "send an email" or "write a row" directly.
export type NotificationEvent =
  | { type: "booking.created"; bookingId: string }
  | { type: "booking.updated"; bookingId: string }
  | { type: "booking.cancelled"; bookingId: string }
  | { type: "payment.received"; bookingId: string }
  | { type: "checkin.reminder"; bookingId: string }
  | { type: "checkout.reminder"; bookingId: string };

export async function notify(event: NotificationEvent): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[notify] ${event.type}`, event);
}
