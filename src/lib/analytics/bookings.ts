import { nightsFor } from "@/lib/stayRange";
import { isBookingCompleted } from "@/lib/bookingStatus";

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

export type FunnelBooking = {
  date: string | Date;
  checkOutDate: string | Date | null;
  paid: boolean;
  dpAmount: number | null;
  checkedInAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
  cancelledAt?: string | Date | null;
};

/**
 * A status-progression funnel — Created → Paid (full or downpayment) →
 * Checked in → Checked out, alongside Cancelled — built entirely from
 * fields that already exist. NOT a marketing-inquiry conversion funnel:
 * this app has no record of a browse/inquiry that didn't become a real
 * booking (every guest or staff booking attempt becomes a real Booking
 * row immediately), so that kind of funnel has no data source here.
 */
export function bookingFunnel(bookings: FunnelBooking[]): { stage: string; count: number }[] {
  const created = bookings.length;
  const paidCount = bookings.filter((b) => b.paid || (b.dpAmount ?? 0) > 0).length;
  const checkedIn = bookings.filter((b) => !!b.checkedInAt).length;
  const checkedOut = bookings.filter((b) => !!b.checkedOutAt).length;
  const cancelled = bookings.filter((b) => !!b.cancelledAt).length;
  return [
    { stage: "Created", count: created },
    { stage: "Paid / Downpaid", count: paidCount },
    { stage: "Checked in", count: checkedIn },
    { stage: "Checked out", count: checkedOut },
    { stage: "Cancelled", count: cancelled },
  ];
}

export type LeadTimeBooking = { date: string | Date; createdAt: string | Date; cancelledAt?: string | Date | null };

const LEAD_TIME_BUCKETS = [
  { label: "Same day", max: 0 },
  { label: "1-3 days", max: 3 },
  { label: "4-7 days", max: 7 },
  { label: "8-14 days", max: 14 },
  { label: "15-30 days", max: 30 },
  { label: "30+ days", max: Infinity },
];

/** How far in advance guests book — days between when the booking was logged and the actual stay date. */
export function leadTimeDistribution(bookings: LeadTimeBooking[]): { bucket: string; count: number }[] {
  const counts = new Map(LEAD_TIME_BUCKETS.map((b) => [b.label, 0]));
  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const days = Math.max(0, Math.round((new Date(b.date).getTime() - new Date(b.createdAt).getTime()) / 86400000));
    const bucket = LEAD_TIME_BUCKETS.find((lb) => days <= lb.max) ?? LEAD_TIME_BUCKETS[LEAD_TIME_BUCKETS.length - 1];
    counts.set(bucket.label, (counts.get(bucket.label) ?? 0) + 1);
  }
  return LEAD_TIME_BUCKETS.map((b) => ({ bucket: b.label, count: counts.get(b.label) ?? 0 }));
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type HeatmapBooking = { date: string | Date; checkOutDate: string | Date | null; createdAt: string | Date; cancelledAt?: string | Date | null };

/**
 * Day-of-week counts for when guests actually booked, checked in, or
 * checked out — the "peak booking/check-in/check-out days" figures.
 * Check-out uses checkOutDate when set (Night/Full stays), falling back to
 * the check-in date for Daycation (which has no separate checkout date).
 */
export function peakDayCounts(bookings: HeatmapBooking[], dimension: "booked" | "checkIn" | "checkOut"): { dow: string; count: number }[] {
  const counts = new Array(7).fill(0);
  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const d = dimension === "booked" ? new Date(b.createdAt) : dimension === "checkIn" ? new Date(b.date) : new Date(b.checkOutDate ?? b.date);
    counts[d.getUTCDay()] += 1;
  }
  return DOW_LABELS.map((label, i) => ({ dow: label, count: counts[i] }));
}
