// Pure, Prisma-free booking-completion check — deliberately its own module
// (not gamification.ts, which imports the Prisma client) because this is
// also used from payroll.ts, which is imported by client components
// (e.g. EarningsView.tsx). Importing anything that transitively pulls in
// @/lib/prisma from a client-bundled module breaks the client build.

import { manilaDayKey } from "@/lib/manilaTime";
import { getOccupiedWindow } from "@/lib/stayRange";

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

/**
 * A booking counts toward gamification (Elite Booker Challenge tiers) once
 * its stay has actually finished. Commission does NOT use this — see
 * isCommissionEligible below.
 *
 * When the caller has stayType on hand, this uses the real occupied-window
 * end (stayRange.ts's getOccupiedWindow — checkOutTime, or the stay
 * type/Airbnb-aware default when it's unset) instead of a naive comparison
 * against checkOutDate's stored midnight-UTC value. The naive version
 * flagged a stay "completed" as soon as UTC rolled over past midnight on
 * the checkout's calendar day — for a Daycation checking out 8pm Manila
 * (noon UTC), that's a 12-hour window where the guest is still actively
 * there but this already counted the booking as finished (a real gap: it
 * fed Elite Booker Challenge tier crossings and My Earnings' completed-stay
 * counts). Some call sites don't select stayType — for those this still
 * falls back to the previous date-only comparison, exactly as before.
 */
export function isBookingCompleted(
  booking: { date: Date | string; checkOutDate: Date | string | null; stayType?: string; checkInTime?: string | null; checkOutTime?: string | null; platform?: string },
  now: Date = new Date()
): boolean {
  if (booking.stayType) {
    const window = getOccupiedWindow({
      stayType: booking.stayType,
      date: new Date(booking.date),
      checkOutDate: booking.checkOutDate ? new Date(booking.checkOutDate) : null,
      checkInTime: booking.checkInTime,
      checkOutTime: booking.checkOutTime,
      platform: booking.platform,
    });
    return window.end.getTime() <= now.getTime();
  }
  const end = booking.checkOutDate ? new Date(booking.checkOutDate) : new Date(booking.date);
  return end.getTime() <= now.getTime();
}

/**
 * The ₱/booking commission rule: money kept, not yet given back — and, for
 * a cancelled booking, only when the cancellation was genuinely the
 * guest's own.
 *   - An active (non-cancelled) booking earns commission once it's fully
 *     paid — no more waiting for the stay to actually check out.
 *   - A cancelled booking only earns commission when it's explicitly
 *     marked cancellationCategory: "guestCancelled" (a real, legit
 *     guest-initiated cancellation) AND money was collected and never
 *     refunded. Any other cancellation — a mistaken/duplicate entry
 *     ("bookerConfusion"), a unit reassigned to a different/VIP guest
 *     ("vipReassignment"), or any legacy cancelled booking from before
 *     this distinction existed (cancellationCategory left null) — earns no
 *     commission at all, paid or not: the booker didn't actually bring in
 *     a guest who stayed, so there's nothing to credit them for.
 *   - A refund reverses commission either way, regardless of paid/cancelled
 *     status — refundedAt is the one thing that always wins.
 * Deliberately independent of isBookingCompleted — a same-day paid booking
 * shouldn't have to wait until midnight to count.
 */
export function isCommissionEligible(booking: { paid: boolean; cancelledAt?: Date | string | null; cancellationCategory?: string | null; dpAmount?: number | null; refundedAt?: Date | string | null }): boolean {
  if (booking.refundedAt) return false;
  if (booking.cancelledAt) {
    return booking.cancellationCategory === "guestCancelled" && (booking.paid || (booking.dpAmount ?? 0) > 0);
  }
  return booking.paid;
}

/**
 * Guest-facing "Booking Status" text — a down-payment booking reads as a
 * real, secured reservation once its down payment is confirmed, even
 * though the remaining balance is still outstanding, not the same thing
 * as fully "Paid." Was duplicated between my-bookings/page.tsx and the
 * guest welcome banner; consolidated here.
 */
export function paymentLabel(booking: { paid: boolean; paymentType: string; dpAmount: number | null }): { text: string; cls: string } {
  if (booking.paid) return { text: "Paid", cls: "text-green" };
  if (booking.paymentType === "down_payment" && booking.dpAmount) return { text: "Confirmed", cls: "text-teal" };
  return { text: "Payment pending", cls: "text-amber" };
}
