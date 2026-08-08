import type { DashboardPeriodType } from "@/lib/payroll";

// Business runs in Manila (UTC+8) — always bucket "today"/period boundaries
// by the Manila calendar date, not the server or browser's own timezone.
// Extracted from DashboardView.tsx (previously a private helper duplicated
// nowhere else) so Dashboard and the Analytics module share one definition
// of every period boundary and can never disagree on what "This Month"
// means.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * "Now," represented the same UTC-placeholder way every period boundary in
 * this file already is (see manilaDayStart's doc comment in format.ts) —
 * Manila's Y/M/D/H/M/S, reinterpreted as if they were UTC. Every period
 * boundary below (current.start/end) is this same kind of placeholder, not
 * a true UTC instant; subtracting a *true* UTC Date.now() from one of them
 * (as previousPeriodRangeFor used to) silently mixes the two, and Manila
 * being UTC+8 means true-UTC-now sits up to 8 hours *behind* its own
 * placeholder for most of the Manila day — enough to round a genuinely
 * elapsed calendar day down to the previous one depending on what time it
 * is. Caught via live testing (a "This Month" comparison label read "Jul
 * 1–7" instead of "Jul 1–8" on the 9th), not by inspection.
 */
export function manilaNowPlaceholder(d: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Intl can format midnight as hour "24" with hour12:false in some engines.
  const hour = get("hour") % 24;
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second")));
}

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
 * The comparison window for every Growth % KPI and period-over-period
 * chart — same length as `current`, but LIKE-FOR-LIKE: if `current` hasn't
 * finished yet (its end is still in the future relative to right now), the
 * previous window is clipped to the same elapsed portion instead of the
 * full prior period. Comparing 6 days of this August against all 31 days
 * of July is not a valid comparison — the growth % it produces is
 * meaningless (usually reads as a steep, fake "decline" for no real
 * reason) and, because Analytics' AI Executive Insight is fed this exact
 * number and told to narrate it, an invalid comparison used to turn into a
 * confidently-wrong sentence, not just a misleading badge.
 *
 * A period that's already fully closed (e.g. "Yesterday", or any period
 * being viewed after it ended) is unaffected — full period vs. full period
 * is already the correct comparison there, so this only ever narrows the
 * window, never widens a currently-correct one. "Custom" still has no
 * natural cadence, so its full-length previous window is derived the same
 * way as before; it goes through the same elapsed-clipping afterward.
 */
export function previousPeriodRangeFor(
  rangeType: AnalyticsPeriodType,
  offset: number,
  custom?: { start: string; end: string }
): { start: Date; end: Date } {
  const current = periodRangeFor(rangeType, offset, custom);
  const previousFull =
    rangeType === "custom"
      ? (() => {
          const lengthMs = current.end.getTime() - current.start.getTime();
          return { start: new Date(current.start.getTime() - lengthMs), end: new Date(current.start) };
        })()
      : periodRangeFor(rangeType, offset - 1, custom);

  const now = manilaNowPlaceholder().getTime();
  if (current.end.getTime() <= now) return previousFull;

  const elapsedMs = Math.max(0, Math.min(now, current.end.getTime()) - current.start.getTime());
  return { start: previousFull.start, end: new Date(previousFull.start.getTime() + elapsedMs) };
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
    previous: previousPeriodRangeFor(rangeType, offset),
  };
}
