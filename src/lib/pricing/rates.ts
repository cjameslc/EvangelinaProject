import { occupiedRange } from "@/lib/stayRange";
import { isManilaWeekend } from "@/lib/manilaTime";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

export type RateTable = {
  weekdayRate12h: number;
  weekdayRate21h: number;
  weekendRate12h: number;
  weekendRate21h: number;
  weekdayNightPromoPct: number;
};

export type PriceQuote = {
  stayType: StayType;
  nights: number;
  // Pre-discount total across every night in the stay.
  standardTotal: number;
  // The promo % actually applied (0 if no night in the stay qualified).
  discountPct: number;
  discountAmount: number;
  // standardTotal - discountAmount — what the guest owes in total.
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

/**
 * Guest-facing quote, priced night by night so a stay spanning a
 * weekday→weekend boundary charges each night at its own rate rather than
 * just the check-in day's rate. The 10% weekday-night promo applies only to
 * Night-stay nights landing on a weekday (Mon-Thu) — Daycation and Full
 * stays are never discounted, matching the spec exactly.
 *
 * Amounts are whole pesos (rounded), matching this app's existing money
 * convention for Booking.amount/Settings rates (unlike the newer centavo-
 * precise Analytics fields) — so a 10% discount on ₱1,699 rounds to ₱170,
 * not the fractional ₱169.90 in the spec's illustrative example.
 */
export function quotePrice(stayType: StayType, date: Date, checkOutDate: Date | null, rates: RateTable, dpFee: number): PriceQuote {
  const { start, end } = occupiedRange(stayType, date, checkOutDate);
  const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));

  let standardTotal = 0;
  let discountAmount = 0;
  const cursor = new Date(start);
  for (let i = 0; i < nights; i++) {
    const rate = baseRateForNight(stayType, cursor, rates);
    standardTotal += rate;
    if (stayType === "Night" && !isManilaWeekend(cursor)) {
      discountAmount += Math.round((rate * rates.weekdayNightPromoPct) / 100);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const total = standardTotal - discountAmount;
  const dpAmount = Math.min(dpFee, total);

  return {
    stayType,
    nights,
    standardTotal,
    discountPct: discountAmount > 0 ? rates.weekdayNightPromoPct : 0,
    discountAmount,
    total,
    dpAmount,
    balanceDue: total - dpAmount,
  };
}
