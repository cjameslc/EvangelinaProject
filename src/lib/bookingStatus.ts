// Pure, Prisma-free booking-completion check — deliberately its own module
// (not gamification.ts, which imports the Prisma client) because this is
// also used from payroll.ts, which is imported by client components
// (e.g. EarningsView.tsx). Importing anything that transitively pulls in
// @/lib/prisma from a client-bundled module breaks the client build.

/** A booking counts toward gamification (Elite Booker Challenge tiers) once its stay has actually finished. Commission does NOT use this — see isCommissionEligible below. */
export function isBookingCompleted(booking: { date: Date | string; checkOutDate: Date | string | null }, now: Date = new Date()): boolean {
  const end = booking.checkOutDate ? new Date(booking.checkOutDate) : new Date(booking.date);
  return end.getTime() <= now.getTime();
}

/**
 * The ₱/booking commission rule: money kept, not yet given back.
 *   - An active (non-cancelled) booking earns commission once it's fully
 *     paid — no more waiting for the stay to actually check out.
 *   - A cancelled booking still earns commission if a down payment (or the
 *     full amount) was collected and never refunded — the business kept the
 *     money, so the booker still gets credit for bringing it in.
 *   - A refund reverses commission either way, regardless of paid/cancelled
 *     status — refundedAt is the one thing that always wins.
 * Deliberately independent of isBookingCompleted — a same-day paid booking
 * shouldn't have to wait until midnight to count.
 */
export function isCommissionEligible(booking: { paid: boolean; cancelledAt?: Date | string | null; dpAmount?: number | null; refundedAt?: Date | string | null }): boolean {
  if (booking.refundedAt) return false;
  if (booking.paid) return true;
  return !!booking.cancelledAt && (booking.dpAmount ?? 0) > 0;
}
