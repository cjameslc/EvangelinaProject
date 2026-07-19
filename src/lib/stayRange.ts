// Pure booking date-range logic — no Prisma import, so this is safe to use
// from client components too (unlike calendarMirror.ts, which pulls in the
// Prisma client for syncCalendarMirror and can't be bundled client-side).
// calendarMirror.ts re-exports these for its existing server-side callers.

/**
 * Computes the `endDate` for a Booking's mirrored CalendarBlock.
 *
 * Daycation always occupies a single calendar day. Night/Full stays span
 * through checkout — the explicit checkOutDate if the booking set one,
 * otherwise the next day after check-in — so the calendar grid highlights
 * every night actually occupied, not just the check-in day.
 */
export function calendarBlockEndDate(stayType: string, date: Date, checkOutDate: Date | null): Date | null {
  if (stayType === "Daycation") return null;
  if (checkOutDate) return checkOutDate;
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

/**
 * Whether two bookings on the same unit actually conflict. A Full stay
 * blocks the whole day against anything. Two stays of the same type
 * overlapping always conflict. Daycation and Night may share the exact same
 * single calendar day (different time slots) — but only when neither one
 * actually spans multiple nights, since a multi-night stay occupies the
 * room around the clock for every day in its range.
 */
export function bookingsConflict(
  a: { stayType: string; date: Date; checkOutDate: Date | null },
  b: { stayType: string; date: Date; checkOutDate: Date | null }
): boolean {
  const ra = occupiedRange(a.stayType, a.date, a.checkOutDate);
  const rb = occupiedRange(b.stayType, b.date, b.checkOutDate);
  if (!rangesOverlap(ra.start, ra.end, rb.start, rb.end)) return false;
  if (a.stayType === "Full" || b.stayType === "Full") return true;
  const aSingleDay = ra.end.getTime() - ra.start.getTime() <= 86400000;
  const bSingleDay = rb.end.getTime() - rb.start.getTime() <= 86400000;
  if (a.stayType !== b.stayType && aSingleDay && bSingleDay) return false;
  return true;
}
