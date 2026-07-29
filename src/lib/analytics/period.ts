import type { DashboardPeriodType } from "@/lib/payroll";

// Business runs in Manila (UTC+8) — always bucket "today"/period boundaries
// by the Manila calendar date, not the server or browser's own timezone.
// Extracted from DashboardView.tsx (previously a private helper duplicated
// nowhere else) so Dashboard and the Analytics module share one definition
// of every period boundary and can never disagree on what "This Month"
// means.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** The Manila calendar day (YYYY-MM-DD) a given instant falls on — exported for chart bucketing (revenueSeries etc.), which needs the same timezone rule every period boundary already uses. */
export const manilaDayKey = dayOf;

export type AnalyticsPeriodType = DashboardPeriodType | "quarterly";

export function periodRangeFor(
  rangeType: AnalyticsPeriodType,
  offset: number,
  custom?: { start: string; end: string }
): { start: Date; end: Date } {
  const [y, m, d] = dayOf(new Date()).split("-").map(Number);
  if (rangeType === "daily") {
    const start = new Date(Date.UTC(y, m - 1, d));
    start.setUTCDate(start.getUTCDate() + offset);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  if (rangeType === "weekly") {
    const anchor = new Date(Date.UTC(y, m - 1, d));
    const start = new Date(anchor);
    start.setUTCDate(start.getUTCDate() - anchor.getUTCDay() + offset * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }
  if (rangeType === "monthly") {
    const start = new Date(Date.UTC(y, m - 1 + offset, 1));
    const end = new Date(Date.UTC(y, m + offset, 1));
    return { start, end };
  }
  if (rangeType === "quarterly") {
    const currentQuarterStartMonth = Math.floor((m - 1) / 3) * 3;
    const startMonth = currentQuarterStartMonth + offset * 3;
    const start = new Date(Date.UTC(y, startMonth, 1));
    const end = new Date(Date.UTC(y, startMonth + 3, 1));
    return { start, end };
  }
  if (rangeType === "custom") {
    const fallback = new Date(Date.UTC(y, m - 1, d));
    const fallbackEnd = new Date(fallback);
    fallbackEnd.setUTCDate(fallbackEnd.getUTCDate() + 1);
    if (!custom?.start || !custom?.end) return { start: fallback, end: fallbackEnd };
    let start = new Date(`${custom.start}T00:00:00Z`);
    let end = new Date(`${custom.end}T00:00:00Z`);
    // AnalyticsFilterBar's date inputs have no min/max guard (unlike
    // Dashboard's/SocialMediaView's own custom-range pickers, which do),
    // and this range is also read directly from the URL query string on
    // every render — so a backwards pick (end before start) is reachable
    // either by the UI or by a hand-edited/pasted URL, not just a
    // theoretical edge case. Previously only `end` fell back to tomorrow
    // while `start` was left as whatever later date the user picked,
    // producing a range even MORE inverted than what was typed (e.g.
    // start=Aug 15, end=Aug 1 → end fell back to "tomorrow", still before
    // start) — every Analytics query silently returned zero rows with no
    // indication why. Swapping instead means "two dates, either order"
    // always produces the range the user actually meant.
    if (end < start) [start, end] = [end, start];
    end.setUTCDate(end.getUTCDate() + 1); // inclusive of the selected end date
    return { start, end };
  }
  // yearly
  const start = new Date(Date.UTC(y + offset, 0, 1));
  const end = new Date(Date.UTC(y + offset + 1, 0, 1));
  return { start, end };
}

/**
 * The immediately-preceding period of the same length — powers every
 * Growth % KPI and period-over-period chart comparison. "Custom" has no
 * natural "previous" cadence, so it's approximated as the same-length
 * window immediately before the selected range (matches the logic this
 * was extracted from in DashboardView.tsx).
 */
export function previousPeriodRangeFor(
  rangeType: AnalyticsPeriodType,
  offset: number,
  custom?: { start: string; end: string }
): { start: Date; end: Date } {
  if (rangeType === "custom") {
    const current = periodRangeFor(rangeType, offset, custom);
    const lengthMs = current.end.getTime() - current.start.getTime();
    return { start: new Date(current.start.getTime() - lengthMs), end: new Date(current.start) };
  }
  return periodRangeFor(rangeType, offset - 1, custom);
}

/** Whole days spanned by a period — e.g. for prorating a salary or scaling a flat weekly rate. */
export function daysInRange(range: { start: Date; end: Date }): number {
  return Math.round((range.end.getTime() - range.start.getTime()) / 86400000);
}

/** The fixed named presets the Analytics filter bar offers — not an offsettable nav like Dashboard's period picker, just a direct preset -> range mapping. */
export type AnalyticsPeriodPreset = "today" | "yesterday" | "week" | "month" | "quarter" | "year" | "custom";

export const ANALYTICS_PERIOD_PRESETS: { value: AnalyticsPeriodPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

/** Resolves a filter-bar preset (+ optional custom start/end) to both the current period and its immediately-preceding same-length period, for every KPI/chart that needs a period-over-period comparison. */
export function resolveAnalyticsPeriod(
  preset: AnalyticsPeriodPreset,
  custom?: { start: string; end: string }
): { current: { start: Date; end: Date }; previous: { start: Date; end: Date } } {
  const map: Record<Exclude<AnalyticsPeriodPreset, "custom">, { rangeType: AnalyticsPeriodType; offset: number }> = {
    today: { rangeType: "daily", offset: 0 },
    yesterday: { rangeType: "daily", offset: -1 },
    week: { rangeType: "weekly", offset: 0 },
    month: { rangeType: "monthly", offset: 0 },
    quarter: { rangeType: "quarterly", offset: 0 },
    year: { rangeType: "yearly", offset: 0 },
  };
  if (preset === "custom") {
    return {
      current: periodRangeFor("custom", 0, custom),
      previous: previousPeriodRangeFor("custom", 0, custom),
    };
  }
  const { rangeType, offset } = map[preset];
  return {
    current: periodRangeFor(rangeType, offset),
    previous: periodRangeFor(rangeType, offset - 1),
  };
}
