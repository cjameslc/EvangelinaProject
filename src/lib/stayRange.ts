// Pure booking date-range logic — no Prisma import, so this is safe to use
// from client components too (unlike calendarMirror.ts, which pulls in the
// Prisma client for syncCalendarMirror and can't be bundled client-side).
// calendarMirror.ts re-exports these for its existing server-side callers.

import { STAY_TYPE_DEFAULT_TIMES, AIRBNB_DEFAULT_TIMES } from "@/lib/constants";
import { manilaWallClockToRealInstant } from "@/lib/manilaTime";

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

type BookingLike = { stayType: string; date: Date; checkOutDate: Date | null; checkInTime?: string | null; checkOutTime?: string | null; platform?: string };

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
 * recorded — e.g. legacy-migrated rows, or an Airbnb booking imported before
 * icalSync.ts started stamping AIRBNB_DEFAULT_TIMES on create; those now-old
 * rows fall back to Airbnb's own 2pm/11am standard here rather than the
 * generic Full stay's noon checkout). If the computed end would land at or
 * before the start (a checkout time earlier than the check-in time on the
 * same nominal day — the classic "Flexible booking crosses midnight" case),
 * the end rolls forward a day at a time until it's genuinely after the start.
 */
export function getOccupiedWindow(b: BookingLike): { start: Date; end: Date } {
  const defaults = b.platform === "Airbnb"
    ? AIRBNB_DEFAULT_TIMES
    : STAY_TYPE_DEFAULT_TIMES[b.stayType] ?? { checkInTime: "08:00", checkOutTime: "20:00", nextDay: false };
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

/** The literal calendar day a checkout *timestamp* falls on — the "when
 * does this booking check out" reading, as opposed to lastOccupiedDay's
 * "which day was actually occupied" reading (those two agree for every
 * checkout time except exactly midnight, where lastOccupiedDay steps back
 * a day on purpose — see its own comment).
 *
 * getOccupiedWindow()'s start/end are NOT real UTC instants: combineDateAndTime
 * builds them via setUTCHours() on a UTC-midnight-anchored day, so the
 * hour-of-day is a placeholder for Asia/Manila wall-clock time, not a real
 * UTC hour. A genuine UTC->Asia/Manila conversion (e.g. an Intl
 * DateTimeFormat with timeZone: "Asia/Manila") is therefore WRONG here — it
 * would double-apply the +8h shift and silently push any checkout time
 * from 16:00 onward into the next calendar day. Confirmed live: a Daycation
 * checking in Aug 21 08:00 and out Aug 21 20:00 displayed "Out Aug 22" in
 * the Bookings tab (booking EVA-BRFSWK) when an earlier fix ran window.end
 * through exactly that kind of real timezone conversion. window.end's own
 * UTC-labeled Y/M/D already IS the intended calendar day — no further zone
 * conversion is needed or correct. */
/** Truncates any getOccupiedWindow() instant (start OR end, not just a
 * checkout) down to its own bare UTC-midnight calendar day — the general
 * form of checkoutDisplayDay below, for callers that need "what calendar
 * day does this placeholder nominally fall on" for a check-in instant, a
 * checkout instant, or any other occupied-window boundary. Safe to run
 * through a REAL timezone conversion afterward (e.g. manilaDayKey/dayOf),
 * unlike the placeholder timestamp itself — see checkoutDisplayDay's own
 * comment for the full explanation of why that matters. */
export function nominalCalendarDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

export function checkoutDisplayDay(window: { end: Date }): Date {
  return nominalCalendarDay(window.end);
}

/**
 * Whether two bookings on the same unit actually conflict — a pure
 * real-timestamp overlap of their actual (or stay-type-defaulted)
 * check-in/check-out windows via getOccupiedWindow/windowsOverlap.
 * Booking type never decides availability by itself; it only supplies the
 * default check-in/check-out time when a booking doesn't have its own
 * explicit time recorded (see getOccupiedWindow). This also correctly
 * handles a window that crosses midnight (e.g. two identical 6pm-5am
 * bookings on the same unit must conflict, even though naive same-day
 * minute comparison would miss it: a "5am" checkout is numerically earlier
 * than a "6pm" check-in — getOccupiedWindow's roll-forward fixes that).
 *
 * Previously this short-circuited to "no conflict" whenever two bookings
 * were different stay types and each spanned a single calendar day (e.g.
 * Daycation vs. Night), on the assumption those types occupy genuinely
 * non-overlapping default time slots. That assumption was already false
 * for this property's own defaults (Daycation 08:00-20:00 vs. Night
 * 14:00-12:00-next-day genuinely overlap 14:00-20:00), and got worse once
 * check-in/check-out times became editable per booking — a Night booking
 * moved earlier, or a Daycation extended later, could silently overlap an
 * existing booking of a different type and both would be accepted. Real
 * double bookings, not a rounding nuance.
 */
export function bookingsConflict(a: BookingLike, b: BookingLike): boolean {
  return windowsOverlap(getOccupiedWindow(a), getOccupiedWindow(b));
}

const TARDINESS_GRACE_MS = 10 * 60 * 1000;

/**
 * How many real minutes late a cleaning started relative to its booking's
 * real scheduled checkout, past a 10-minute grace period — null if
 * on-time/early, or an implausible outlier (see maxPlausibleLateMs).
 *
 * Was previously hand-duplicated in two API routes (housekeeping's own
 * unit/[id] PATCH handler, and the Dashboard's housekeeping-ops metrics
 * route — the second one's own comment admitted the copy-paste outright).
 * Both were wrong in two independent ways, found during an audit for
 * duplicated date logic:
 *
 * 1. The scheduled time was built with a hardcoded "12:00" fallback for a
 *    booking with no recorded checkOutTime — correct for Night/Full, wrong
 *    for a Daycation (which defaults to 20:00 everywhere else in the app).
 *    A Daycation with no explicit checkout time would read as ~8 hours
 *    "late" the moment a housekeeper started right on time.
 *
 * 2. Far more severe: that hand-built "scheduled" timestamp is an Asia/
 *    Manila wall-clock placeholder (setUTCHours stamps the checkout HOUR
 *    directly onto a UTC-labeled day — see getOccupiedWindow's own
 *    comment), not a real UTC instant. Both routes then subtracted it from
 *    startedAt — a REAL timestamp (`new Date()` at PATCH-time, or a real
 *    CleaningLog.startedAt column) — with no conversion. Confirmed
 *    empirically before this fix: a housekeeper starting a genuine 1 real
 *    hour after the true scheduled checkout (well past the 10-minute
 *    grace) was reported as perfectly on time, because the placeholder sits
 *    a full Manila-UTC-offset (+8h) ahead of the real scheduled instant —
 *    tardiness only registered at all once a housekeeper started more than
 *    8 real hours late, and even then under-reported the delay by exactly
 *    8 hours. This silently suppressed the tardiness/"cleaning.late"
 *    notification and the Dashboard's late-cleaning metrics for the
 *    overwhelming majority of realistic same-day lateness.
 */
export function minutesLateFor(
  booking: { stayType?: string; date: Date; checkOutDate: Date | null; checkInTime?: string | null; checkOutTime?: string | null; platform?: string },
  startedAt: Date,
  maxPlausibleLateMs: number = 24 * 3600 * 1000
): number | null {
  const window = getOccupiedWindow({
    stayType: booking.stayType ?? "Full",
    date: booking.date,
    checkOutDate: booking.checkOutDate,
    checkInTime: booking.checkInTime,
    checkOutTime: booking.checkOutTime,
    platform: booking.platform,
  });
  const scheduledReal = manilaWallClockToRealInstant(window.end);
  const delayMs = startedAt.getTime() - scheduledReal.getTime() - TARDINESS_GRACE_MS;
  return delayMs > 0 && delayMs <= maxPlausibleLateMs ? Math.round(delayMs / 60000) : null;
}
