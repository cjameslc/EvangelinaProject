// Pure, Prisma-free booking-completion check — deliberately its own module
// (not gamification.ts, which imports the Prisma client) because this is
// also used from payroll.ts, which is imported by client components
// (e.g. EarningsView.tsx). Importing anything that transitively pulls in
// @/lib/prisma from a client-bundled module breaks the client build.

import { manilaDayKey } from "@/lib/manilaTime";

export type GuestJourneyStage = "before_stay" | "check_in_day" | "during_stay" | "checkout_day" | "completed" | "cancelled";

/**
 * The single source of truth for "what point of their stay is this guest
 * at" — the Guest Journey Portal's timeline stepper, and any UI that needs
 * to know whether to show Before-Stay content, the Check-in Experience,
 * concierge-mode During Stay, the Checkout checklist, or a post-stay
 * summary. Consolidates two previously-duplicated, slightly-divergent local
 * implementations (my-bookings/page.tsx's statusOf() — coarse
 * upcoming/active/completed/cancelled — and GuidebookView.tsx's
 * stayStatus() — checked-in/day-count text). Both now call this instead.
 *
 * cancelledAt always wins. Otherwise: checkedOutAt (or the stay window
 * having already ended) means completed; before the check-in date is
 * before_stay; the check-in day and checkout day are their own distinct
 * stages (Check-in Experience vs. Checkout checklist read very differently
 * even though both can fall on "today"); anything strictly between is
 * during_stay. A same-day stay (Daycation/Night, checkOutDate on the same
 * calendar day as date) never has a during_stay window — it's check_in_day
 * for its whole short duration, which is correct: there's no multi-day
 * middle to speak of.
 */
export function guestJourneyStage(
  booking: {
    date: Date | string;
    checkOutDate: Date | string | null;
    checkedInAt?: Date | string | null;
    checkedOutAt?: Date | string | null;
    cancelledAt?: Date | string | null;
  },
  now: Date = new Date()
): GuestJourneyStage {
  if (booking.cancelledAt) return "cancelled";

  const checkIn = new Date(booking.date);
  const checkOut = booking.checkOutDate ? new Date(booking.checkOutDate) : checkIn;

  if (booking.checkedOutAt || now.getTime() >= checkOut.getTime()) return "completed";
  if (now.getTime() < checkIn.getTime()) return "before_stay";

  const today = manilaDayKey(now);
  if (today === manilaDayKey(checkIn)) return "check_in_day";
  if (today === manilaDayKey(checkOut)) return "checkout_day";
  return "during_stay";
}

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
