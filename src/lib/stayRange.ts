// Pure booking date-range logic — no Prisma import, so this is safe to use
// from client components too (unlike calendarMirror.ts, which pulls in the
// Prisma client for syncCalendarMirror and can't be bundled client-side).
// calendarMirror.ts re-exports these for its existing server-side callers.

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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Same-day time-of-day window used only for real overlap checking against a
// Flexible booking (Daycation/Night's own coexistence with each other stays
// on the coarse "different type never conflicts" rule below, unchanged).
// Falls back to each type's smart-schedule default when no explicit time was
// recorded, so older rows without one still compare sensibly.
function timeWindowMinutes(stayType: string, checkInTime: string | null | undefined, checkOutTime: string | null | undefined): { start: number; end: number } {
  if (stayType === "Night") {
    // Only the portion of the stay that falls on THIS shared day matters —
    // it continues past midnight into its checkout day, handled separately
    // by that day's own occupiedRange/rangesOverlap check.
    return { start: checkInTime ? timeToMinutes(checkInTime) : 17 * 60, end: 24 * 60 };
  }
  // Daycation and Flexible both default to the same 8am-8pm smart-schedule
  // suggestion when no explicit time was set.
  return {
    start: checkInTime ? timeToMinutes(checkInTime) : 8 * 60,
    end: checkOutTime ? timeToMinutes(checkOutTime) : 20 * 60,
  };
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
 * is checked against the two bookings' actual time-of-day windows instead.
 */
export function bookingsConflict(
  a: { stayType: string; date: Date; checkOutDate: Date | null; checkInTime?: string | null; checkOutTime?: string | null },
  b: { stayType: string; date: Date; checkOutDate: Date | null; checkInTime?: string | null; checkOutTime?: string | null }
): boolean {
  const ra = occupiedRange(a.stayType, a.date, a.checkOutDate);
  const rb = occupiedRange(b.stayType, b.date, b.checkOutDate);
  if (!rangesOverlap(ra.start, ra.end, rb.start, rb.end)) return false;
  if (a.stayType === "Full" || b.stayType === "Full") return true;
  const aSingleDay = ra.end.getTime() - ra.start.getTime() <= 86400000;
  const bSingleDay = rb.end.getTime() - rb.start.getTime() <= 86400000;
  if (aSingleDay && bSingleDay) {
    if (a.stayType === "Flexible" || b.stayType === "Flexible") {
      const aw = timeWindowMinutes(a.stayType, a.checkInTime, a.checkOutTime);
      const bw = timeWindowMinutes(b.stayType, b.checkInTime, b.checkOutTime);
      return aw.start < bw.end && bw.start < aw.end;
    }
    if (a.stayType !== b.stayType) return false;
  }
  return true;
}
