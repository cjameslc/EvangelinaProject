import { useMemo } from "react";
import { totalSalaryPayroll, type SalaryHistoryEntry } from "@/lib/payroll";
import { billPaidCentavos } from "@/lib/format";
import { collectedAmountCentavos } from "@/lib/finance";
import { computeOccupancy, computeADR, computeRevPAR, type OccupancyBlock } from "@/lib/analytics/occupancy";
import { occupiedRange } from "@/lib/stayRange";
import { daysInRange, manilaDayKey as dayOf } from "@/lib/analytics/period";
import { elapsedDaysInMonth, sameElapsedRange, monthStartOffset, formatRangeLabel, formatRangeLabelShort, pctChange } from "@/lib/analytics/periodComparison";
import { isCompletedStay } from "./completedStay";
import type { Booking, Employee } from "../types";

type BillLite = { unitId: string | null; month: string; paid: boolean; paidAt: string | null; amountDue: number; amountPaid: number | null; amountDueCentavos?: number | null; amountPaidCentavos?: number | null };
type ExpenseRequestLite = { category: string; amount: number; status: string; date: string };
type WeeklyExpenseLite = { category?: string; amount: number; date: string };

type PeriodRange = { start: Date; end: Date };

export type PeriodMetrics = {
  range: PeriodRange;
  label: string;
  shortLabel: string;
  days: number;
  revenueCentavos: number; // completed-stay revenue only — matches "Profit to date"'s own revenue base
  cashInCentavos: number; // everything collected regardless of stay completion — matches Cash Flow's existing definition
  costsCentavos: number; // paid bills (by real paidAt) + accrued payroll + approved expense requests + TikTok ads, all attributed by real date
  profitCentavos: number; // revenueCentavos - costsCentavos
  marginPct: number;
  cashFlowCentavos: number; // cashInCentavos - costsCentavos
  occupancyPct: number;
  availableNights: number;
  occupiedNights: number;
  revparCentavos: number;
  adrCentavos: number;
};

function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function computePeriodMetrics(params: {
  range: PeriodRange;
  bookings: Booking[];
  bills: BillLite[];
  expenseRequests: ExpenseRequestLite[];
  weeklyExpenses: WeeklyExpenseLite[];
  employees: Employee[];
  salaryHistory: SalaryHistoryEntry[];
  unitCount: number;
  maintenanceBlocks: OccupancyBlock[];
  cleaningBlocks: OccupancyBlock[];
}): PeriodMetrics {
  const { range, bookings, bills, expenseRequests, weeklyExpenses, employees, salaryHistory, unitCount, maintenanceBlocks, cleaningBlocks } = params;
  const days = daysInRange(range);

  // Revenue attribution convention already used throughout this app: a
  // stay's income is recognized on its check-in date.
  const bookingsInRange = bookings.filter((b) => {
    const d = new Date(dayOf(new Date(b.date)));
    return d >= range.start && d < range.end;
  });
  const revenueCentavos = bookingsInRange.filter(isCompletedStay).reduce((s, b) => s + collectedAmountCentavos(b), 0);
  const cashInCentavos = bookingsInRange.reduce((s, b) => s + collectedAmountCentavos(b), 0);

  // Attributed by paidAt (the real date money left), not the bill's
  // `month` billing bucket — a bill paid in a different month than it's
  // billed for belongs to the period it was actually paid in.
  const paidBillsCentavos = bills
    .filter((b) => b.paid && b.paidAt && new Date(b.paidAt) >= range.start && new Date(b.paidAt) < range.end)
    .reduce((s, b) => s + billPaidCentavos(b), 0);

  // Payroll has no "paid date" — it's accrued continuously, same convention
  // this app's current-month Realized profit already uses (totalSalaryPayroll
  // "custom" for the days elapsed). Applied identically to every comparison
  // period so a historical month's payroll is scaled to the same day count.
  const accruedPayrollCentavos = totalSalaryPayroll(employees, salaryHistory, "custom", range.start, days) * 100;

  const approvedExpensesCentavos = expenseRequests
    .filter((e) => e.status === "APPROVED" && new Date(dayOf(new Date(e.date))) >= range.start && new Date(dayOf(new Date(e.date))) < range.end)
    .reduce((s, e) => s + e.amount, 0) * 100;

  const tikTokAdsCentavos = weeklyExpenses
    .filter((e) => e.category === "TIKTOK_ADS" && new Date(dayOf(new Date(e.date))) >= range.start && new Date(dayOf(new Date(e.date))) < range.end)
    .reduce((s, e) => s + e.amount, 0) * 100;

  const costsCentavos = paidBillsCentavos + accruedPayrollCentavos + approvedExpensesCentavos + tikTokAdsCentavos;
  const profitCentavos = revenueCentavos - costsCentavos;
  const marginPct = revenueCentavos > 0 ? Math.round((profitCentavos / revenueCentavos) * 100) : 0;
  const cashFlowCentavos = cashInCentavos - costsCentavos;

  // Occupancy needs overlap-based scoping (a stay straddling the period
  // boundary must still count for the nights it actually covers inside the
  // window) — same reasoning as useEarningsData's periodBookingsForOccupancy.
  const bookingsOverlapping = bookings.filter((b) => {
    const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
    return start.getTime() < range.end.getTime() && end.getTime() > range.start.getTime();
  });
  const occ = computeOccupancy({ unitCount, periodStart: range.start, periodEnd: range.end, bookings: bookingsOverlapping, maintenanceBlocks, cleaningBlocks });
  // RevPAR/ADR use all collected income (cashIn), same base useEarningsData's
  // own filteredRevpar/filteredAdr already use for the current single period.
  const revparCentavos = computeRevPAR(cashInCentavos, occ.availableNights) * 100;
  const adrCentavos = computeADR(bookingsInRange, range.start, range.end) * 100;

  return {
    range, label: formatRangeLabel(range), shortLabel: formatRangeLabelShort(range), days,
    revenueCentavos, cashInCentavos, costsCentavos, profitCentavos, marginPct, cashFlowCentavos,
    occupancyPct: occ.occupancyPct, availableNights: occ.availableNights, occupiedNights: occ.occupiedNights,
    revparCentavos, adrCentavos,
  };
}

export type KeyMetricsComparison = {
  current: PeriodMetrics;
  lastMonth: PeriodMetrics;
  benchmarkMonths: PeriodMetrics[]; // [last month, 2 months ago, 3 months ago] — same 3 months "last month" is itself the most recent of
  benchmarkAvg: {
    revenueCentavos: number; profitCentavos: number; marginPct: number; cashFlowCentavos: number;
    occupancyPct: number; revparCentavos: number; adrCentavos: number;
  };
  forecast: {
    profitCentavos: number; // current MTD actual + (3-month avg daily profit rate × remaining days) — never a naive ×30/elapsed extrapolation
    remainingDays: number;
    vsBenchmarkPct: number | null;
  };
  remainingOpenNights: number; // nights still available (not yet booked) for the rest of this calendar month — the "opportunity" figure
  elapsedDays: number;
  comparison: {
    profitVsLastMonthPct: number | null;
    profitVsBenchmarkPct: number | null;
    marginPtsVsLastMonth: number;
    cashFlowVsLastMonthPct: number | null;
    occupancyPtsVsLastMonth: number;
    occupancyPtsVsBenchmark: number;
    revparVsLastMonthPct: number | null;
    adrVsLastMonthPct: number | null;
  };
};

/**
 * Date-aware performance comparison for the Dashboard's Key Metrics card —
 * "how am I doing right now" is meaningless without a same-length baseline
 * (Aug 1–8 vs all of July is not a valid comparison, see periodComparison.ts),
 * so every figure here is computed for 4 identically-shaped windows (this
 * month's elapsed days, and the same elapsed-day window in each of the 3
 * months before it) from the same real booking/bill/payroll/expense data
 * the rest of the app already uses — nothing here is estimated or
 * fabricated, only the *comparison* (which real numbers to hold up against
 * which) is new.
 */
export function useKeyMetricsComparison({
  todayIso,
  monthStart,
  bookings,
  bills,
  expenseRequests,
  weeklyExpenses,
  employees,
  salaryHistory,
  unitCount,
  maintenanceBlocks,
  cleaningBlocks,
}: {
  todayIso: string;
  monthStart: Date;
  bookings: Booking[];
  bills: BillLite[];
  expenseRequests: ExpenseRequestLite[];
  weeklyExpenses: WeeklyExpenseLite[];
  employees: Employee[];
  salaryHistory: SalaryHistoryEntry[];
  unitCount: number;
  maintenanceBlocks: OccupancyBlock[];
  cleaningBlocks: OccupancyBlock[];
}): KeyMetricsComparison {
  return useMemo(() => {
    const elapsedDays = elapsedDaysInMonth(todayIso);
    const base = { bookings, bills, expenseRequests, weeklyExpenses, employees, salaryHistory, unitCount, maintenanceBlocks, cleaningBlocks };

    const periods = [0, -1, -2, -3].map((offset) =>
      computePeriodMetrics({ ...base, range: sameElapsedRange(monthStart, offset, elapsedDays) })
    );
    const [current, lastMonth, bench2, bench3] = periods;
    const benchmarkMonths = [lastMonth, bench2, bench3];

    const benchmarkAvg = {
      revenueCentavos: average(benchmarkMonths.map((p) => p.revenueCentavos)),
      profitCentavos: average(benchmarkMonths.map((p) => p.profitCentavos)),
      marginPct: Math.round(average(benchmarkMonths.map((p) => p.marginPct))),
      cashFlowCentavos: average(benchmarkMonths.map((p) => p.cashFlowCentavos)),
      occupancyPct: average(benchmarkMonths.map((p) => p.occupancyPct)),
      revparCentavos: average(benchmarkMonths.map((p) => p.revparCentavos)),
      adrCentavos: average(benchmarkMonths.map((p) => p.adrCentavos)),
    };

    // Forecast = current MTD actual + (3-month avg daily profit rate ×
    // remaining days) — blended toward real historical pace, never a naive
    // current-rate × 30/elapsed extrapolation (which is what made the old
    // Forecast card swing so far negative early in a month: it assumed zero
    // more bookings would ever come in, not that the rest of the month
    // would perform like it normally does).
    const daysInCurrentMonth = daysInRange({ start: monthStart, end: monthStartOffset(monthStart, 1) });
    const remainingDays = Math.max(0, daysInCurrentMonth - elapsedDays);
    const avgHistoricalDailyProfitCentavos = elapsedDays > 0 ? benchmarkAvg.profitCentavos / elapsedDays : 0;
    const forecastProfitCentavos = Math.round(current.profitCentavos + avgHistoricalDailyProfitCentavos * remainingDays);
    // What a full month at the 3-month benchmark's own daily pace would
    // total — the scale-matched baseline for "vs 3-month benchmark" below.
    // benchmarkAvg.profitCentavos itself only covers the same `elapsedDays`
    // sub-window every other benchmark figure does (8 days, not the whole
    // month) — comparing a full-month forecast against that 8-day figure
    // directly would always read as a wildly inflated percentage, exactly
    // because the two numbers cover different-length periods, not because
    // performance is actually that far off.
    const benchmarkFullMonthProjectionCentavos = Math.round(avgHistoricalDailyProfitCentavos * daysInCurrentMonth);

    // "Opportunity" — real nights from today through month-end that aren't
    // booked yet (available minus already-occupied), so the insight can say
    // something constructive rather than just naming the shortfall.
    const remainingRange = { start: new Date(`${todayIso}T00:00:00Z`), end: monthStartOffset(monthStart, 1) };
    const remainingBookingsOverlapping = bookings.filter((b) => {
      const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
      return start.getTime() < remainingRange.end.getTime() && end.getTime() > remainingRange.start.getTime();
    });
    const remainingOcc = computeOccupancy({ unitCount, periodStart: remainingRange.start, periodEnd: remainingRange.end, bookings: remainingBookingsOverlapping, maintenanceBlocks, cleaningBlocks });
    const remainingOpenNights = Math.max(0, remainingOcc.availableNights - remainingOcc.occupiedNights);

    return {
      current, lastMonth, benchmarkMonths, benchmarkAvg,
      forecast: {
        profitCentavos: forecastProfitCentavos,
        remainingDays,
        vsBenchmarkPct: pctChange(forecastProfitCentavos, benchmarkFullMonthProjectionCentavos),
      },
      remainingOpenNights,
      elapsedDays,
      comparison: {
        profitVsLastMonthPct: pctChange(current.profitCentavos, lastMonth.profitCentavos),
        profitVsBenchmarkPct: pctChange(current.profitCentavos, benchmarkAvg.profitCentavos),
        marginPtsVsLastMonth: current.marginPct - lastMonth.marginPct,
        cashFlowVsLastMonthPct: pctChange(current.cashFlowCentavos, lastMonth.cashFlowCentavos),
        occupancyPtsVsLastMonth: current.occupancyPct - lastMonth.occupancyPct,
        occupancyPtsVsBenchmark: current.occupancyPct - Math.round(benchmarkAvg.occupancyPct),
        revparVsLastMonthPct: pctChange(current.revparCentavos, lastMonth.revparCentavos),
        adrVsLastMonthPct: pctChange(current.adrCentavos, lastMonth.adrCentavos),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIso, monthStart.getTime(), bookings, bills, expenseRequests, weeklyExpenses, employees, salaryHistory, unitCount, maintenanceBlocks, cleaningBlocks]);
}
