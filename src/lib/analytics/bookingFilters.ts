// The shared Booker/Platform/Stay Type/Status filter layer for the
// Analytics page — applied AFTER the existing period+unit-scoped Prisma
// fetch (which every fetchXData function already does correctly and is
// left untouched), never as a second competing WHERE clause. When none of
// these filters are set (every existing URL/bookmark, and the page's
// default state) this returns its input completely unchanged — the exact
// property that makes rolling this out across every already-shipped
// Analytics section safe: no filter selected means no behavior change.
//
// "Status" needs real date/time logic (an "active" stay is defined by a
// real occupied-window overlap with now, not a stored column) so it can't
// be a plain Prisma WHERE fragment — reuses isBookingCompleted
// (bookingStatus.ts, already the canonical "is this stay over" check)
// rather than re-deriving that logic a second time.
import { isBookingCompleted } from "@/lib/bookingStatus";
import { manilaNowPlaceholder } from "@/lib/analytics/period";

export type BookingStatusFilter = "upcoming" | "active" | "completed" | "cancelled";

export type FilterableBooking = {
  bookerId?: string | null;
  platform?: string | null;
  stayType?: string | null;
  cancelledAt?: string | Date | null;
  date: string | Date;
  checkOutDate?: string | Date | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

export type BookingFilterExtra = {
  bookerIds?: string[] | null;
  platforms?: string[] | null;
  stayTypes?: string[] | null;
  statuses?: BookingStatusFilter[] | null;
};

/** Same lifecycle vocabulary BookingsView.tsx's own lifecycleStatus() uses (cancelled > completed > active > upcoming), so a booking filtered as e.g. "active" here means the same thing a staff member sees on the Bookings tab. */
export function classifyBookingStatus(b: FilterableBooking, now: Date): BookingStatusFilter {
  if (b.cancelledAt) return "cancelled";
  if (isBookingCompleted({ date: b.date, checkOutDate: b.checkOutDate ?? null, stayType: b.stayType ?? undefined, checkInTime: b.checkInTime, checkOutTime: b.checkOutTime, platform: b.platform ?? undefined }, now)) return "completed";
  const checkIn = new Date(b.date);
  return checkIn.getTime() <= now.getTime() ? "active" : "upcoming";
}

/**
 * Deliberately an UNCONSTRAINED generic (`T`, not `T extends
 * FilterableBooking`) — every real caller's booking array comes back from
 * an `unstable_cache`-wrapped fetch function typed `any` (they return
 * `JSON.parse(JSON.stringify(...))`, which TS can only ever type as
 * `any`), and a constrained generic collapses an `any` argument down to
 * the constraint type, silently discarding every other field the caller's
 * downstream computation functions need (revenue/occupancy/guest/staff
 * booking shapes all need fields FilterableBooking doesn't carry). Casting
 * to FilterableBooking internally instead keeps T inferred as whatever the
 * caller actually passed — `any` stays `any`, a concretely-typed array
 * (like this file's own tests) stays concretely typed.
 */
export function applyBookingFilters<T>(bookings: T[], filters: BookingFilterExtra, now: Date = manilaNowPlaceholder()): T[] {
  let result = bookings;
  if (filters.bookerIds && filters.bookerIds.length > 0) {
    const set = new Set(filters.bookerIds);
    result = result.filter((b) => { const bookerId = (b as FilterableBooking).bookerId; return !!bookerId && set.has(bookerId); });
  }
  if (filters.platforms && filters.platforms.length > 0) {
    const set = new Set(filters.platforms);
    result = result.filter((b) => { const platform = (b as FilterableBooking).platform; return !!platform && set.has(platform); });
  }
  if (filters.stayTypes && filters.stayTypes.length > 0) {
    const set = new Set(filters.stayTypes);
    result = result.filter((b) => { const stayType = (b as FilterableBooking).stayType; return !!stayType && set.has(stayType); });
  }
  if (filters.statuses && filters.statuses.length > 0) {
    const set = new Set(filters.statuses);
    result = result.filter((b) => set.has(classifyBookingStatus(b as FilterableBooking, now)));
  }
  return result;
}

/** True when at least one of the extra filters is actually set — lets a caller skip the pass entirely rather than iterating for no reason. */
export function hasActiveBookingFilters(filters: BookingFilterExtra): boolean {
  return !!(filters.bookerIds?.length || filters.platforms?.length || filters.stayTypes?.length || filters.statuses?.length);
}
