import { nightsFor } from "@/lib/stayRange";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

export type PriceQuote = {
  stayType: StayType;
  nights: number;
  nightlyRate: number;
  total: number;
};

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
 */
export function quotePrice(unit: { nightlyRate: number }, stayType: StayType, date: Date, checkOutDate: Date | null): PriceQuote {
  const nights = nightsFor(stayType, date, checkOutDate);
  return { stayType, nights, nightlyRate: unit.nightlyRate, total: unit.nightlyRate * nights };
}
