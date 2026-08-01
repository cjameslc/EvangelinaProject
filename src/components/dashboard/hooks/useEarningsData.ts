import { useMemo, useState } from "react";
import { fmtDate } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/constants";
import { nightsFor, occupiedRange } from "@/lib/stayRange";
import { totalSalaryPayroll, type SalaryHistoryEntry } from "@/lib/payroll";
import { collectedAmountPesos } from "@/lib/finance";
import { periodRangeFor, manilaDayKey as dayOf } from "@/lib/analytics/period";
import { computeOccupancy, computeADR, computeRevPAR, type OccupancyBlock } from "@/lib/analytics/occupancy";
import type { Unit, Booking, Employee, RangeType, StatusFilter } from "../types";

const collectedAmount = (b: Booking): number => collectedAmountPesos(b);

/**
 * Earnings period filter — Weekly/Monthly/Yearly, an optional single day,
 * and unit status — plus every derived value the Earnings card and the Key
 * metrics card's Occupancy/RevPAR/ADR both read off the same selected
 * period, so the two cards can never silently disagree about what period is
 * selected.
 *
 * Defaults to "monthly", not "weekly" — this drives the Key metrics card's
 * Occupancy/RevPAR/ADR (see filteredOccupancyData below), which sits in the
 * same card as Realized/Forecast Profit, Margin, and Cash Flow — all four
 * of which are always "this month" regardless of this filter (see the
 * comment on filteredOccupancyData for why). A "weekly" default silently
 * showed a different period than the rest of that same card, and than
 * Analytics' own default "This Month" view — a real, confirmed discrepancy
 * (e.g. Occupancy showing 69% here vs Analytics' 76% for what looked like
 * "the same" current state, simply because one was a 7-day window and the
 * other was the full month). The underlying period filter itself is a real,
 * deliberate feature (staff can still switch to daily/weekly/yearly/custom)
 * — only the out-of-the-box default was misleading.
 */
export function useEarningsData({
  units,
  earningsBookings,
  statusCategory,
  employees,
  salaryHistory,
  calendarBlocksOccupancy,
  airbnbHistoricalMonthly,
}: {
  units: Unit[];
  earningsBookings: Booking[];
  statusCategory: (unit: Unit) => Exclude<StatusFilter, "all">;
  employees: Employee[];
  salaryHistory: SalaryHistoryEntry[];
  calendarBlocksOccupancy: OccupancyBlock[];
  airbnbHistoricalMonthly?: Record<string, number>;
}) {
  const [rangeType, setRangeType] = useState<RangeType>("monthly");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const periodRange = useMemo(
    () => periodRangeFor(rangeType, periodOffset, customRange),
    [rangeType, periodOffset, customRange]
  );
  // Whole days spanned by the period — used to prorate salary for "daily"
  // and "custom" ranges (weekly/monthly/yearly use their own fixed formula),
  // and to scale the Auditor's flat weekly rate in "Your team".
  const periodDays = Math.round((periodRange.end.getTime() - periodRange.start.getTime()) / 86400000);
  const periodLabel = useMemo(() => {
    if (rangeType === "daily") return fmtDate(periodRange.start, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
    if (rangeType === "weekly") {
      const lastDay = new Date(periodRange.end.getTime() - 86400000);
      return `${fmtDate(periodRange.start, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} – ${fmtDate(lastDay, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`;
    }
    if (rangeType === "monthly") return fmtDate(periodRange.start, { month: "long", year: "numeric", timeZone: "Asia/Manila" });
    if (rangeType === "custom") {
      const lastDay = new Date(periodRange.end.getTime() - 86400000);
      return `${fmtDate(periodRange.start, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} – ${fmtDate(lastDay, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`;
    }
    return fmtDate(periodRange.start, { year: "numeric", timeZone: "Asia/Manila" });
  }, [rangeType, periodRange]);
  // Same phrasing already used by the Earnings card's "You've earned ___"
  // line — reused here for the Key metrics tooltips so both cards describe
  // the selected period identically.
  const periodPhrase = rangeType === "daily" ? "today" : rangeType === "weekly" ? "this week" : rangeType === "monthly" ? "this month" : rangeType === "custom" ? "in this range" : "this year";
  const periodPhraseCap = rangeType === "daily" ? "Today" : rangeType === "weekly" ? "This week" : rangeType === "monthly" ? "This month" : rangeType === "custom" ? "This range" : "This year";

  const filteredUnits = useMemo(
    () => (statusFilter === "all" ? units : units.filter((u) => statusCategory(u) === statusFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, statusFilter, statusCategory]
  );

  const periodBookings = useMemo(() => {
    const unitIds = new Set(filteredUnits.map((u) => u.id));
    return earningsBookings.filter((b) => {
      if (!unitIds.has(b.unitId)) return false;
      const iso = dayOf(new Date(b.date));
      if (selectedDate && iso !== selectedDate) return false;
      const d = new Date(iso);
      return d >= periodRange.start && d < periodRange.end;
    });
  }, [earningsBookings, filteredUnits, selectedDate, periodRange]);

  const periodIncome = periodBookings.reduce((s, b) => s + collectedAmount(b), 0);

  // Historical-record fallback: only kicks in for a Monthly-view month the
  // app has zero tracked income for (i.e. before this app existed) — real
  // tracked income for a month always wins, never blended/overridden.
  const historicalMonthKey = `${periodRange.start.getUTCFullYear()}-${String(periodRange.start.getUTCMonth() + 1).padStart(2, "0")}`;
  const historicalIncome = rangeType === "monthly" && periodIncome <= 0 ? airbnbHistoricalMonthly?.[historicalMonthKey] : undefined;
  const displayedPeriodIncome = historicalIncome ?? periodIncome;

  // Occupancy scoping is deliberately NOT periodBookings above: periodBookings
  // only keeps bookings whose check-in date falls inside the selected range,
  // which is correct for revenue attribution (a stay's income is recognized
  // when the guest checked in) but wrong for occupancy — a Night/Full stay
  // that checked in a day or two before the period started but is still
  // occupying the room once the period begins was silently dropped from the
  // occupancy count entirely, undercounting real occupied nights (a
  // confirmed bug: a multi-night stay straddling a period boundary showed 0
  // occupied nights for the portion inside the new period). Filters on real
  // occupied-range overlap with the period instead, so any stay touching the
  // window counts — computeOccupancy still clips each range to
  // [periodStart, periodEnd) internally. A selected single day (selectedDate)
  // narrows this to just that day, same as periodBookings does above.
  const occupancyPeriodRange = useMemo(() => {
    if (!selectedDate) return periodRange;
    const start = new Date(selectedDate);
    const end = new Date(start.getTime() + 86400000);
    return { start, end };
  }, [selectedDate, periodRange]);

  const periodBookingsForOccupancy = useMemo(() => {
    const unitIds = new Set(filteredUnits.map((u) => u.id));
    return earningsBookings.filter((b) => {
      if (!unitIds.has(b.unitId)) return false;
      const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
      return start.getTime() < occupancyPeriodRange.end.getTime() && end.getTime() > occupancyPeriodRange.start.getTime();
    });
  }, [earningsBookings, filteredUnits, occupancyPeriodRange]);

  // Occupancy/RevPAR/ADR for the Key metrics card — driven by the same
  // period+status filter as Earnings above (periodRange/filteredUnits),
  // instead of a permanently-fixed "this week, every unit" snapshot. A
  // Status filter like "Occupied only" correctly narrows the unit count AND
  // which bookings count toward it together. Realized/Forecast profit,
  // Margin, and Cash Flow deliberately stay scoped to "this month" — they
  // pull in bills/payroll/expense data the server only ever fetches for the
  // current month, not an arbitrary selected period.
  const filteredOccupancyData = useMemo(
    () =>
      computeOccupancy({
        unitCount: filteredUnits.length,
        periodStart: occupancyPeriodRange.start,
        periodEnd: occupancyPeriodRange.end,
        bookings: periodBookingsForOccupancy,
        maintenanceBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Maintenance"),
        cleaningBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Cleaning"),
      }),
    [filteredUnits.length, occupancyPeriodRange, periodBookingsForOccupancy, calendarBlocksOccupancy]
  );
  const filteredOccupancy = filteredOccupancyData.occupancyPct;

  // Daycation/Night/Full("21 hrs") split of the same occupied nights above —
  // for the Key metrics card's note, so "Occupancy is X%" also says which
  // stay types made up those nights. Each type's nights are clipped to the
  // occupancy period the same way computeOccupancy clips internally; not
  // deduped against the other two types on a shared unit-day (a Daycation
  // and a Night stay can legitimately share one calendar day — see
  // stayRange.ts's bookingsConflict), so this is a per-type breakdown, not a
  // three-way split of the single headline number.
  const occupancyByStayType = useMemo(() => {
    const result: Record<"Daycation" | "Night" | "Full", { bookings: number; nights: number }> = {
      Daycation: { bookings: 0, nights: 0 },
      Night: { bookings: 0, nights: 0 },
      Full: { bookings: 0, nights: 0 },
    };
    for (const b of periodBookingsForOccupancy) {
      if (b.cancelledAt) continue;
      if (b.stayType !== "Daycation" && b.stayType !== "Night" && b.stayType !== "Full") continue;
      const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
      const s = Math.max(start.getTime(), occupancyPeriodRange.start.getTime());
      const e = Math.min(end.getTime(), occupancyPeriodRange.end.getTime());
      if (e <= s) continue;
      result[b.stayType].bookings += 1;
      result[b.stayType].nights += Math.round((e - s) / 86400000);
    }
    return result;
  }, [periodBookingsForOccupancy, occupancyPeriodRange]);
  const filteredRevpar = computeRevPAR(periodIncome * 100, filteredOccupancyData.availableNights);
  const filteredAdr = useMemo(
    () => computeADR(periodBookings, periodRange.start, periodRange.end),
    [periodBookings, periodRange]
  );

  // Previous period (same length, immediately prior) for the trend
  // indicator — reuses periodRangeFor for daily/weekly/monthly/yearly;
  // "custom" has no natural "previous" cadence, so it's approximated as the
  // same-length window immediately before the selected range.
  const previousPeriodRange = useMemo(() => {
    if (rangeType === "custom") {
      const lengthMs = periodRange.end.getTime() - periodRange.start.getTime();
      return { start: new Date(periodRange.start.getTime() - lengthMs), end: new Date(periodRange.start) };
    }
    return periodRangeFor(rangeType, periodOffset - 1, customRange);
  }, [rangeType, periodOffset, customRange, periodRange]);

  const previousPeriodIncome = useMemo(() => {
    const unitIds = new Set(filteredUnits.map((u) => u.id));
    return earningsBookings
      .filter((b) => {
        if (!unitIds.has(b.unitId)) return false;
        const d = new Date(dayOf(new Date(b.date)));
        return d >= previousPeriodRange.start && d < previousPeriodRange.end;
      })
      .reduce((s, b) => s + collectedAmount(b), 0);
  }, [earningsBookings, filteredUnits, previousPeriodRange]);

  const periodTrendPct =
    previousPeriodIncome > 0
      ? Math.round(((periodIncome - previousPeriodIncome) / previousPeriodIncome) * 100)
      : periodIncome > 0
      ? 100
      : 0;

  // Earnings-by-day buckets for the bar chart — bucketing by day past ~31
  // days would render an unreadable wall of slivers, so longer (yearly)
  // ranges collapse to one bar per month instead.
  const earningsBuckets = useMemo(() => {
    const byDay = periodDays <= 31;
    const buckets = new Map<string, { label: string; dateLabel: string; amount: number; count: number }>();
    const cursor = new Date(periodRange.start);
    while (cursor < periodRange.end) {
      const key = byDay ? dayOf(cursor) : `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = byDay
        ? new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(cursor)
        : new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(cursor);
      const dateLabel = byDay
        ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(cursor)
        : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(cursor);
      if (!buckets.has(key)) buckets.set(key, { label, dateLabel, amount: 0, count: 0 });
      if (byDay) cursor.setUTCDate(cursor.getUTCDate() + 1);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const b of periodBookings) {
      const d = new Date(dayOf(new Date(b.date)));
      const key = byDay ? dayOf(d) : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.amount += collectedAmount(b);
        bucket.count += 1;
      }
    }
    return [...buckets.values()];
  }, [periodRange, periodDays, periodBookings]);

  const avgStayNights = useMemo(() => {
    if (periodBookings.length === 0) return 0;
    const totalNights = periodBookings.reduce(
      (s, b) => s + nightsFor(b.stayType as any, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null),
      0
    );
    return totalNights / periodBookings.length;
  }, [periodBookings]);

  // Revenue by platform — same periodBookings/periodIncome the Earnings card
  // uses, just split out per source, so the two always add up. Walk-in and
  // Direct are combined into one row (both are effectively the same "no
  // online platform" source from a revenue-mix standpoint) — every other
  // platform stays its own row.
  const platformBreakdown = useMemo(() => {
    const groups = [
      ...PLATFORMS.filter((p) => p !== "WalkIn" && p !== "Direct").map((p) => ({ key: p as string, label: PLATFORM_LABEL[p] ?? p, platforms: [p] as string[] })),
      { key: "WalkInDirect", label: "Walk-in/Direct", platforms: ["WalkIn", "Direct"] },
    ];
    const rows = groups.map((g) => {
      const pb = periodBookings.filter((b) => g.platforms.includes(b.platform));
      const revenue = pb.reduce((s, b) => s + collectedAmount(b), 0);
      const nights = pb.reduce((s, b) => s + nightsFor(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null), 0);
      return { platform: g.key, label: g.label, bookings: pb.length, nights, revenue };
    });
    return rows.filter((r) => r.bookings > 0);
  }, [periodBookings]);

  // Salary owed for this period — each active staff member's monthly salary
  // auto-scaled to the selected range (Today = prorated daily, This Week =
  // weekly rate, This Month = monthly rate, This Year = monthly × 12, Custom
  // = prorated by the number of days selected), using whatever rate was
  // historically effective at the start of the period so a later raise/cut
  // never rewrites an already-passed period's numbers. Distinct from
  // "Payroll" in Key metrics, which is money staff *collected* from guests,
  // not money paid *to* staff.
  const periodSalary = totalSalaryPayroll(employees, salaryHistory, rangeType, periodRange.start, periodDays);

  const periodStartIso = dayOf(periodRange.start);
  const periodEndIso = dayOf(new Date(periodRange.end.getTime() - 86400000));

  function resetFilters() {
    setRangeType("monthly");
    setPeriodOffset(0);
    setCustomRange({ start: "", end: "" });
    setSelectedDate(null);
    setStatusFilter("all");
  }

  return {
    rangeType, setRangeType,
    periodOffset, setPeriodOffset,
    customRange, setCustomRange,
    selectedDate, setSelectedDate,
    statusFilter, setStatusFilter,
    resetFilters,
    periodRange,
    periodLabel,
    periodDays,
    periodPhrase,
    periodPhraseCap,
    filteredUnits,
    periodBookings,
    periodIncome,
    historicalIncome,
    displayedPeriodIncome,
    filteredOccupancyData,
    filteredOccupancy,
    occupancyByStayType,
    filteredRevpar,
    filteredAdr,
    previousPeriodRange,
    previousPeriodIncome,
    periodTrendPct,
    earningsBuckets,
    avgStayNights,
    platformBreakdown,
    periodSalary,
    periodStartIso,
    periodEndIso,
  };
}
