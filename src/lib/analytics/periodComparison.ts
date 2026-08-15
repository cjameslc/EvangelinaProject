// Date-aware "same elapsed days" comparison periods for the Dashboard's Key
// Metrics card — the whole point is that Aug 1–8 must only ever be compared
// against Jul 1–8, never against the whole of July. Every range here is
// derived from `elapsedDays`, never a hardcoded day count, so the UI shifts
// automatically as the real date advances (Aug 15 -> Aug 1–15 vs Jul 1–15,
// no code change needed).

/** Whole days elapsed so far in the current Manila calendar month, including today (Aug 8 -> 8). */
export function elapsedDaysInMonth(todayIso: string): number {
  return Number(todayIso.slice(8, 10));
}

/** First day of the Manila calendar month `monthOffset` months from `refMonthStart` (0 = same month, -1 = one month back, ...). */
export function monthStartOffset(refMonthStart: Date, monthOffset: number): Date {
  return new Date(Date.UTC(refMonthStart.getUTCFullYear(), refMonthStart.getUTCMonth() + monthOffset, 1));
}

/**
 * The "first N days" window of the month `monthOffset` months from
 * `refMonthStart`, where N = `elapsedDays` — e.g. offset 0/elapsedDays 8 on
 * an August refMonth is Aug 1–8; offset -1 is Jul 1–8; offset -3 is May 1–8.
 * Clipped to that month's real end so a 31-day elapsed count reaching back
 * into a shorter month (e.g. comparing Mar 31 against Feb) never bleeds
 * into the following month — the range simply covers the whole of the
 * shorter month instead of overshooting.
 */
export function sameElapsedRange(refMonthStart: Date, monthOffset: number, elapsedDays: number): { start: Date; end: Date } {
  const start = monthStartOffset(refMonthStart, monthOffset);
  const monthEnd = monthStartOffset(refMonthStart, monthOffset + 1);
  const proposedEnd = new Date(start.getTime() + elapsedDays * 86400000);
  const end = proposedEnd.getTime() < monthEnd.getTime() ? proposedEnd : monthEnd;
  return { start, end };
}

/** "Aug 1–8, 2026" / "Jul 1–8, 2026" — the exact label the spec calls for next to each comparison period. */
export function formatRangeLabel(range: { start: Date; end: Date }): string {
  const lastDay = new Date(range.end.getTime() - 86400000);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(range.start);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(lastDay);
  return `${month} ${range.start.getUTCDate()}–${lastDay.getUTCDate()}, ${year}`;
}

/** "Jul 1–8" — same as formatRangeLabel but without the year, for compact inline comparison text ("vs Jul 1–8"). */
export function formatRangeLabelShort(range: { start: Date; end: Date }): string {
  const lastDay = new Date(range.end.getTime() - 86400000);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(range.start);
  return `${month} ${range.start.getUTCDate()}–${lastDay.getUTCDate()}`;
}

/** Percent change, rounded to a whole number; null when there's no meaningful baseline to compare against (avoids a fake "+100%"/"-100%" off a ₱0 or 0% base). */
export function pctChange(current: number, baseline: number): number | null {
  if (baseline === 0) return current === 0 ? 0 : null;
  return Math.round(((current - baseline) / baseline) * 100);
}
