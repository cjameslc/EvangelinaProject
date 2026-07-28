// Pure booking date-range logic — no Prisma import, so this is safe to use
// from client components too (unlike calendarMirror.ts, which pulls in the
// Prisma client for syncCalendarMirror and can't be bundled client-side).
// calendarMirror.ts re-exports these for its existing server-side callers.

import { STAY_TYPE_DEFAULT_TIMES } from "@/lib/constants";

/**
 * Computes the `endDate` for a Booking's mirrored CalendarBlock.
 *
 * Daycation and Flexible always occupy a single calendar day (Flexible is
 * deliberately same-day-only — see bookingsConflict below for how its
 * actual chosen times are used). Night/Full stays span through checkout —
 * the explicit checkOutDate if the booking set one, otherwise the next day
 * after check-in — so the calendar grid highlights every night actually
 * occupied, not just the check-in day.
 */
export function calendarBlockEndDate(stayType: string, date: Date, checkOutDate: Date | null): Date | null {
  if (stayType === "Daycation" || stayType === "Flexible") return null;
  // An explicit checkOutDate only counts if it's actually after check-in —
  // Night/Full stays are overnight by definition, so a same-day (or
  // earlier) checkOutDate is bad data, not a genuinely same-day stay.
  // Trusting it as-is used to collapse occupiedRange() to a zero-length
  // interval, which rangesOverlap()'s strict "<" comparison then treated as
  // never overlapping anything — including an identical duplicate booking —
  // silently defeating the double-booking guard for exactly this case.
  if (checkOutDate && checkOutDate.getTime() > date.getTime()) return checkOutDate;
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Occupied [start, end) range for overlap checks — unlike calendarBlockEndDate, this never returns null: Daycation occupies exactly its own single day. */
export function occupiedRange(stayType: string, date: Date, checkOutDate: Date | null): { start: Date; end: Date } {
  const end = calendarBlockEndDate(stayType, date, checkOutDate);
  if (end) return { start: date, end };
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: date, end: next };
}

/** Nights occupied — same range convention as occupiedRange, expressed as a count (minimum 1). */
export function nightsFor(stayType: string, date: Date, checkOutDate: Date | null): number {
  const { start, end } = occupiedRange(stayType, date, checkOutDate);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

type BookingLike = { stayType: string; date: Date; checkOutDate: Date | null; checkInTime?: string | null; checkOutTime?: string | null };

function combineDateAndTime(day: Date, hhmm: string | null | undefined, fallbackHHMM: string): Date {
  const [h, m] = (hhmm ?? fallbackHHMM).split(":").map(Number);
  const d = new Date(day);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

/**
 * Real check-in/check-out timestamps for a booking — combines its calendar
 * date(s) with checkInTime/checkOutTime (falling back to that stay type's
 * smart-schedule default, STAY_TYPE_DEFAULT_TIMES, when a time wasn't
 * recorded — e.g. Airbnb imports and legacy-migrated rows). If the computed
 * end would land at or before the start (a checkout time earlier than the
 * check-in time on the same nominal day — the classic "Flexible booking
 * crosses midnight" case), the end rolls forward a day at a time until it's
 * genuinely after the start.
 */
export function getOccupiedWindow(b: BookingLike): { start: Date; end: Date } {
  const defaults = STAY_TYPE_DEFAULT_TIMES[b.stayType] ?? { checkInTime: "08:00", checkOutTime: "20:00", nextDay: false };
  const start = combineDateAndTime(b.date, b.checkInTime, defaults.checkInTime);
  let endDay = b.checkOutDate ?? b.date;
  let end = combineDateAndTime(endDay, b.checkOutTime, defaults.checkOutTime);
  while (end.getTime() <= start.getTime()) {
    endDay = new Date(endDay);
    endDay.setUTCDate(endDay.getUTCDate() + 1);
    end = combineDateAndTime(endDay, b.checkOutTime, defaults.checkOutTime);
  }
  return { start, end };
}

/** Real-timestamp interval overlap between two occupied windows. */
export function windowsOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Maps a real occupied-window end timestamp back to the inclusive last
 * calendar day it actually occupies (a midnight end means the previous day
 * was the last one touched; any later time-of-day means its own day is
 * still occupied) — lets calendar/list/schedule views keep rendering
 * date/endDate as an inclusive day range while getting correct data. */
export function lastOccupiedDay(window: { end: Date }): Date {
  const end = window.end;
  const isMidnight = end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0 && end.getUTCMilliseconds() === 0;
  const day = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (isMidnight) day.setUTCDate(day.getUTCDate() - 1);
  return day;
}

/**
 * Whether two bookings on the same unit actually conflict. A Full stay
 * blocks the whole day against anything. Two stays of the same type
 * overlapping always conflict. Daycation and Night may share the exact same
 * single calendar day (different time slots) — but only when neither one
 * actually spans multiple nights, since a multi-night stay occupies the
 * room around the clock for every day in its range.
 *
 * Flexible is the one exception to that coarse "different type never
 * conflicts" assumption: since its whole point is an arbitrary same-day
 * time window, any pairing involving it (including two Flexible bookings)
 * is checked against the two bookings' actual real-timestamp occupied
 * windows (getOccupiedWindow/windowsOverlap) instead of the day-level
 * range — which also correctly handles a Flexible window that crosses
 * midnight (e.g. two identical 6pm-5am Flexible bookings on the same unit
 * must conflict, even though naive same-day minute comparison would miss
 * it: a "5am" checkout is numerically earlier than an "6pm" check-in).
 *
 * The day-level range check above has a blind spot: it's an exclusive-end
 * range, so a booking checking out ON day D (any time) and a new booking
 * starting on day D never register as overlapping, even though the first
 * booking may not have actually vacated yet (e.g. a Full stay checking out
 * noon vs. a new booking starting 9am the same day) — the calendar itself
 * renders date/endDate as an INCLUSIVE range (CalendarView.tsx), so it
 * visually shows day D as occupied even though this exclusive-end guard
 * doesn't. When the two bookings' day-ranges are exactly adjacent like
 * this, fall back to a real-timestamp overlap check instead of the day-only
 * one — this is strictly additive (it only catches cases the day-level
 * check already said "no overlap" on) and never touches the same-day
 * carve-outs above, since those only run when the day ranges DO overlap.
 */
export function bookingsConflict(a: BookingLike, b: BookingLike): boolean {
  const ra = occupiedRange(a.stayType, a.date, a.checkOutDate);
  const rb = occupiedRange(b.stayType, b.date, b.checkOutDate);
  if (rangesOverlap(ra.start, ra.end, rb.start, rb.end)) {
    if (a.stayType === "Full" || b.stayType === "Full") return true;
    const aSingleDay = ra.end.getTime() - ra.start.getTime() <= 86400000;
    const bSingleDay = rb.end.getTime() - rb.start.getTime() <= 86400000;
    if (aSingleDay && bSingleDay) {
      if (a.stayType === "Flexible" || b.stayType === "Flexible") {
        return windowsOverlap(getOccupiedWindow(a), getOccupiedWindow(b));
      }
      if (a.stayType !== b.stayType) return false;
    }
    return true;
  }
  if (ra.end.getTime() === rb.start.getTime() || rb.end.getTime() === ra.start.getTime()) {
    return windowsOverlap(getOccupiedWindow(a), getOccupiedWindow(b));
  }
  return false;
}
