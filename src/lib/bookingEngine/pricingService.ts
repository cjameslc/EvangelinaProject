import { quotePrice as computeQuote, type PriceQuote, type RateTable } from "@/lib/pricing/rates";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

export type { PriceQuote, RateTable };

/**
 * There was no reusable pricing calculation anywhere in the app before this
 * — staff have always manually typed a booking's amount (BookingForm only
 * pre-fills it from Unit.nightlyRate as a starting suggestion, never
 * computes a real total). The one exception, Airbnb's imported-booking
 * revenue calc (icalSync.ts's airbnbRevenue), is intentionally left alone —
 * it's a fixed-rate special case for a platform with no visible price in
 * its feed, not a general pricing engine.
 *
 * This is genuinely new logic, built for the guest-facing quote/booking
 * flow. It does not replace or touch staff's manual entry — BookingForm
 * keeps working exactly as before.
 *
 * The rate table is a single site-wide schedule (Admin Settings), not
 * per-unit like the old Unit.nightlyRate-based version — every unit quotes
 * identically for the same date/stayType. See src/lib/pricing/rates.ts for
 * the actual day-of-week/duration/promo math.
 */
export function quotePrice(stayType: StayType, date: Date, checkOutDate: Date | null, rates: RateTable, dpFee: number, checkInTime?: string | null): PriceQuote {
  return computeQuote(stayType, date, checkOutDate, rates, dpFee, checkInTime);
}
