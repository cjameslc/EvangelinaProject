import { nightsFor } from "@/lib/stayRange";

export type StatusBooking = {
  stayType: string;
  date: string | Date;
  checkOutDate: string | Date | null;
  cancelledAt?: string | Date | null;
};

/** % of bookings in the given set that were cancelled. 0 when the set is empty (not a fabricated NaN/Infinity). */
export function cancellationRate(bookings: StatusBooking[]): number {
  if (bookings.length === 0) return 0;
  const cancelled = bookings.filter((b) => b.cancelledAt).length;
  return Math.round((cancelled / bookings.length) * 100);
}

/** Average real nights per (non-cancelled) stay, via nightsFor — one decimal place. 0 when there's nothing to average. */
export function avgStayLengthNights(bookings: StatusBooking[]): number {
  const active = bookings.filter((b) => !b.cancelledAt);
  if (active.length === 0) return 0;
  const totalNights = active.reduce(
    (s, b) => s + nightsFor(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null),
    0
  );
  return Math.round((totalNights / active.length) * 10) / 10;
}
