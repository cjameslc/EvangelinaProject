import { occupiedRange } from "@/lib/stayRange";
import { isManilaWeekend } from "@/lib/manilaTime";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

export type RateTable = {
  weekdayRate12h: number;
  weekdayRate21h: number;
  weekendRate12h: number;
  weekendRate21h: number;
  weekdayNightPromoPct: number;
  // Flat, once-per-booking (not per-night) surcharge for a Flexible stay —
  // Settings.flexibleTimeFee, default ₱150. Previously configured in Admin
  // and shown to guests on the house-manual guide page, but never actually
  // added to any computed price anywhere — a real, confirmed gap between
  // what the guide told a guest to expect and what a Flexible booking
  // actually charged.
  flexibleTimeFee: number;
};

export type PriceQuote = {
  stayType: StayType;
  nights: number;
  // Pre-discount total across every night in the stay.
  standardTotal: number;
  // The promo % actually applied (0 if no night in the stay qualified).
  discountPct: number;
  discountAmount: number;
  // The flat Flexible-stay surcharge actually applied (0 for every other
  // stay type) — kept as its own line, same reasoning as discountAmount
  // above, so the UI can show it distinctly rather than folding it into
  // an unexplained total.
  flexibleFeeAmount: number;
  // standardTotal - discountAmount + flexibleFeeAmount — what the guest owes in total.
  total: number;
  dpAmount: number;
  balanceDue: number;
};

/**
 * Daycation and Night are both "12 Hours" rows in the rate sheet; Full is
 * the "21 Hours" row (see STAY_TYPES in constants.ts — Night: 12hrs, Full:
 * 21hrs). No per-unit variation — one rate table for the whole property.
 * Weekend/weekday (Fri/Sat/Sun vs Mon-Thu) is evaluated on the Asia/Manila
 * calendar day via isManilaWeekend — bookings/dates elsewhere in the app
 * are UTC-midnight-stamped local days, so this keeps rate boundaries
 * aligned with what a Manila guest actually experiences as "the weekend."
 */
function baseRateForNight(stayType: StayType, date: Date, rates: RateTable): number {
  const weekend = isManilaWeekend(date);
  if (stayType === "Full") return weekend ? rates.weekendRate21h : rates.weekdayRate21h;
  return weekend ? rates.weekendRate12h : rates.weekdayRate12h;
}

// Flexible has no fixed window, so "does this resemble a Night stay" (for
// promo eligibility only — the base rate is the same 12h tier either way)
// is decided by whether its chosen check-in time falls at/after this same
// 5pm cutoff bookingWindow.ts uses for the same-day Night-booking rule.
const NIGHT_LIKE_CUTOFF_MINUTES = 17 * 60;
function isNightLikeTime(checkInTime?: string | null): boolean {
  if (!checkInTime) return false;
  const [h, m] = checkInTime.split(":").map(Number);
  return h * 60 + m >= NIGHT_LIKE_CUTOFF_MINUTES;
}

/**
 * Guest-facing quote, priced night by night so a stay spanning a
 * weekday→weekend boundary charges each night at its own rate rather than
 * just the check-in day's rate. The 10% weekday-night promo applies to
 * Night-stay nights landing on a weekday (Mon-Thu), and to a Flexible stay
 * whose chosen check-in time is evening-or-later on a weekday (same rate as
 * "whichever type it resembles") — Daycation and Full stays are never
 * discounted, matching the spec exactly.
 *
 * Amounts are whole pesos (rounded), matching this app's existing money
 * convention for Booking.amount/Settings rates (unlike the newer centavo-
 * precise Analytics fields) — so a 10% discount on ₱1,699 rounds to ₱170,
 * not the fractional ₱169.90 in the spec's illustrative example.
 */
export function quotePrice(stayType: StayType, date: Date, checkOutDate: Date | null, rates: RateTable, dpFee: number, checkInTime?: string | null): PriceQuote {
  const { start, end } = occupiedRange(stayType, date, checkOutDate);
  const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const promoEligibleType = stayType === "Night" || (stayType === "Flexible" && isNightLikeTime(checkInTime));

  let standardTotal = 0;
  let discountAmount = 0;
  const cursor = new Date(start);
  for (let i = 0; i < nights; i++) {
    const rate = baseRateForNight(stayType, cursor, rates);
    standardTotal += rate;
    if (promoEligibleType && !isManilaWeekend(cursor)) {
      discountAmount += Math.round((rate * rates.weekdayNightPromoPct) / 100);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const flexibleFeeAmount = stayType === "Flexible" ? Math.max(0, rates.flexibleTimeFee || 0) : 0;
  const total = standardTotal - discountAmount + flexibleFeeAmount;
  const { dpAmount, balanceDue } = splitDownPayment(total, dpFee);

  return {
    stayType,
    nights,
    standardTotal,
    discountPct: discountAmount > 0 ? rates.weekdayNightPromoPct : 0,
    discountAmount,
    flexibleFeeAmount,
    total,
    dpAmount,
    balanceDue,
  };
}

/** How much of a given total is due now (capped at the total itself) vs.
 * left as a balance — the same split quotePrice uses internally, reused
 * wherever a total changes after the fact (e.g. a coupon discount applied
 * on top of an already-quoted total) so the two never disagree. */
export function splitDownPayment(total: number, dpFee: number): { dpAmount: number; balanceDue: number } {
  const dpAmount = Math.min(dpFee, total);
  return { dpAmount, balanceDue: total - dpAmount };
}

/** Applies a flat peso discount (e.g. from a coupon) on top of an
 * already-computed quote's total, recomputing the down-payment split
 * against the new (lower) total. Never touches standardTotal/discountPct/
 * discountAmount — those remain the weekday-night promo's own numbers,
 * kept separate so the UI can show promo and coupon as two distinct lines
 * rather than one conflated discount. */
export function applyCouponDiscount(quote: PriceQuote, couponDiscountAmount: number, dpFee: number): PriceQuote {
  const total = Math.max(0, quote.total - couponDiscountAmount);
  const { dpAmount, balanceDue } = splitDownPayment(total, dpFee);
  return { ...quote, total, dpAmount, balanceDue };
}
