// Pure, Prisma-free booking-completion check — deliberately its own module
// (not gamification.ts, which imports the Prisma client) because this is
// also used from payroll.ts, which is imported by client components
// (e.g. EarningsView.tsx). Importing anything that transitively pulls in
// @/lib/prisma from a client-bundled module breaks the client build.

import { manilaDayKey, manilaWallClockToRealInstant } from "@/lib/manilaTime";
import { getOccupiedWindow, nominalCalendarDay } from "@/lib/stayRange";

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
 *
 * When the caller has stayType on hand, this uses the real occupied-window
 * boundaries (getOccupiedWindow) instead of the raw date/checkOutDate
 * fields — same upgrade isBookingCompleted below already had, now applied
 * here too (this function had never received it, confirmed by audit: for
 * a same-day stay type, checkIn and checkOut were literally the same bare
 * UTC-midnight instant, so `now >= checkOut` went true the moment the
 * calendar rolled onto the stay's own day at 8am Manila — before the guest
 * had even checked in for a later-starting Daycation, and for the entire
 * rest of the stay. check_in_day/during_stay/checkout_day were
 * unreachable for these stay types; the Guest Portal showed "Stay
 * completed" throughout, contradicting this very doc comment's claim that
 * a same-day stay is "check_in_day for its whole short duration").
 *
 * getOccupiedWindow's start/end are Asia/Manila wall-clock placeholders,
 * not real UTC instants (see manilaWallClockToRealInstant's own doc
 * comment) — comparing them directly against a real `now` would be wrong
 * by exactly Manila's UTC+8 offset, and this function's day-bucket checks
 * would double-apply that offset if run through manilaDayKey (a genuine
 * timezone conversion) without first truncating via nominalCalendarDay.
 * Both corrections are applied below. Some call sites don't select
 * stayType — for those this still falls back to the previous
 * date/checkOutDate-only comparison, exactly as before (those fields are
 * always bare UTC-midnight instants, never placeholders, so no conversion
 * is needed or correct there).
 */
export function guestJourneyStage(
  booking: {
    date: Date | string;
    checkOutDate: Date | string | null;
    checkedInAt?: Date | string | null;
    checkedOutAt?: Date | string | null;
    cancelledAt?: Date | string | null;
    stayType?: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    platform?: string;
  },
  now: Date = new Date()
): GuestJourneyStage {
  if (booking.cancelledAt) return "cancelled";

  // Two independent derivations from the same source, not one chained into
  // the other: checkInReal/checkOutReal (real instants, for the </>=
  // comparisons against `now`) and checkInDay/checkOutDay (nominal
  // calendar days, for the day-bucket checks). Converting a placeholder to
  // a real instant and THEN truncating it to a calendar day silently
  // shifts the day for any wall-clock time before Manila's UTC+8 offset —
  // e.g. a 2:00 AM check-in's real instant falls on the PREVIOUS UTC
  // calendar date even though it's still the same Manila day. Confirmed
  // wrong this way in an earlier draft of this exact fix before being
  // caught and corrected.
  let checkInReal: Date;
  let checkOutReal: Date;
  let checkInDay: string;
  let checkOutDay: string;
  if (booking.stayType) {
    const window = getOccupiedWindow({
      stayType: booking.stayType,
      date: new Date(booking.date),
      checkOutDate: booking.checkOutDate ? new Date(booking.checkOutDate) : null,
      checkInTime: booking.checkInTime,
      checkOutTime: booking.checkOutTime,
      platform: booking.platform,
    });
    checkInReal = manilaWallClockToRealInstant(window.start);
    checkOutReal = manilaWallClockToRealInstant(window.end);
    checkInDay = manilaDayKey(nominalCalendarDay(window.start));
    checkOutDay = manilaDayKey(nominalCalendarDay(window.end));
  } else {
    checkInReal = new Date(booking.date);
    checkOutReal = booking.checkOutDate ? new Date(booking.checkOutDate) : checkInReal;
    // Bare date/checkOutDate fields are always real UTC-midnight instants,
    // never placeholders, so a direct manilaDayKey conversion is correct
    // here (unlike the placeholder case above).
    checkInDay = manilaDayKey(checkInReal);
    checkOutDay = manilaDayKey(checkOutReal);
  }

  if (booking.checkedOutAt || now.getTime() >= checkOutReal.getTime()) return "completed";
  if (now.getTime() < checkInReal.getTime()) return "before_stay";

  const today = manilaDayKey(now);
  if (today === checkInDay) return "check_in_day";
  if (today === checkOutDay) return "checkout_day";
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
    // window.end is an Asia/Manila wall-clock placeholder (see
    // manilaWallClockToRealInstant's own doc comment), not a real UTC
    // instant — comparing it directly against a real `now` (every actual
    // caller passes plain `new Date()`, confirmed by audit) was wrong by
    // exactly Manila's UTC+8 offset: a Daycation checking out 8pm Manila
    // (real instant 12:00 UTC) only flipped to "completed" once real UTC
    // time reached 20:00 — 8 real hours after the guest had actually left.
    // This gated Elite Booker Challenge tier crossings, My Earnings'
    // completed-stay counts, and guest feedback eligibility
    // ("Feedback opens once your stay is complete") all landing up to 8
    // hours late. Confirmed live via direct calculation before this fix.
    return manilaWallClockToRealInstant(window.end).getTime() <= now.getTime();
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
