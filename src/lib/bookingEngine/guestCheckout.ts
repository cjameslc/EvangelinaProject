import type { StayType } from "@/lib/bookingEngine/availabilityService";

/**
 * Guest self-service rule (not shared with staff manual bookings, which
 * still allow any checkOutDate per stayType — see BookingForm.tsx): a
 * Night stay is always exactly one night, check-in to the very next day —
 * never a guest choice, and never trusted from client input either. Only
 * Full stay can span more than one night. Daycation never has a checkout
 * (single day), matching stayRange.ts's calendarBlockEndDate convention.
 *
 * Used by both booking-quote and guest/bookings so the quoted price and
 * the actually-persisted Booking.checkOutDate can never disagree.
 */
export function normalizeGuestCheckOutDate(stayType: StayType, date: Date, checkOutDate: Date | null): Date | null {
  // Same-day only, like Daycation — Flexible's whole point is a same-day
  // time window, never a client-chosen later checkout date.
  if (stayType === "Daycation" || stayType === "Flexible") return null;

  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  if (stayType === "Night") return nextDay;

  // Full: honor a real, later checkout if given; otherwise default to one night.
  return checkOutDate && checkOutDate.getTime() > date.getTime() ? checkOutDate : nextDay;
}
