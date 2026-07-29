import { useMemo } from "react";
import { totalSalaryPayroll, type SalaryHistoryEntry } from "@/lib/payroll";
import { netProfitCentavos as computeNetProfitCentavos, marginPct, cashFlowCentavos, collectedAmountPesos } from "@/lib/finance";
import { isCompletedStay } from "./completedStay";
import type { Booking, Employee, WeeklyExpenseRow } from "../types";

const collectedAmount = (b: Booking): number => collectedAmountPesos(b);

/**
 * Realized vs Forecast — the two figures replace the old single "Net
 * profit," which mixed money already earned/spent with money that was
 * merely expected/upcoming and could look deeply negative for no real
 * reason early in a month.
 */
export function useMonthlyProfitSummary({
  bookingsMonth,
  employees,
  salaryHistory,
  weeklyExpenses,
  expenseRequestsMonth,
  billsDueMonthCentavos,
  billsPaidMonthCentavos,
  todayIso,
}: {
  bookingsMonth: Booking[];
  employees: Employee[];
  salaryHistory: SalaryHistoryEntry[];
  weeklyExpenses: WeeklyExpenseRow[];
  expenseRequestsMonth: { id: string; category: string; amount: number; status: string; date: string; employee: { name: string } | null }[];
  billsDueMonthCentavos: number;
  billsPaidMonthCentavos: number;
  todayIso: string;
}) {
  // Only count the remaining-balance amount once it's actually paid — an
  // unpaid balance isn't collected revenue yet, same convention already
  // used by periodIncome/monthlyPayroll/perUnitMonthlyEarned elsewhere. The
  // downpayment is always counted since logging a DP receipt means it's
  // already in hand.
  const monthIncome = useMemo(
    () => bookingsMonth.reduce((sum, b) => sum + collectedAmount(b), 0),
    [bookingsMonth]
  );
  const completedMonthIncome = useMemo(
    () => bookingsMonth.filter(isCompletedStay).reduce((sum, b) => sum + collectedAmount(b), 0),
    [bookingsMonth]
  );
  // Full booked value of every reservation this month, completed or not —
  // "if everything gets collected as booked," the ceiling Forecast profit
  // measures against.
  const expectedMonthIncome = useMemo(
    () => bookingsMonth.reduce((sum, b) => sum + b.amount, 0),
    [bookingsMonth]
  );
  // This calendar month's start, as the reference point for looking up
  // each staff member's historically-effective salary (not necessarily
  // their current rate, if it changed mid-month).
  const thisMonthStart = useMemo(() => {
    const [y, m] = todayIso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }, [todayIso]);
  const monthlyStaffSalary = useMemo(
    () => totalSalaryPayroll(employees, salaryHistory, "monthly", thisMonthStart),
    [employees, salaryHistory, thisMonthStart]
  );
  // Payroll has no separate "marked paid" flag (unlike Bills) — instead it's
  // treated as accrued day by day through the month, same as how a salary
  // actually earns out. Deducting the FULL month's salary from day 1 (the
  // previous behavior) is what made Net Profit look deeply negative at the
  // start of every month even though most of that salary hadn't been earned
  // yet. accruedStaffSalary is what's actually owed for the days elapsed so
  // far; upcomingStaffSalary is the rest of the month's obligation, not yet
  // due.
  const daysElapsedThisMonth = useMemo(() => Number(todayIso.slice(8, 10)), [todayIso]);
  const accruedStaffSalary = useMemo(
    () => totalSalaryPayroll(employees, salaryHistory, "custom", thisMonthStart, daysElapsedThisMonth),
    [employees, salaryHistory, thisMonthStart, daysElapsedThisMonth]
  );
  const upcomingStaffSalary = Math.max(0, monthlyStaffSalary - accruedStaffSalary);

  // TikTok Ads is a pure operational expense — deducted from Realized profit
  // like a paid bill, but never touches anyone's payroll (it's always
  // untargeted, enforced server-side too). Logged/edited from Admin's
  // Weekly report tab now, not here — this is just the month total still
  // needed for the profit calc below.
  const thisMonthIsoForAds = todayIso.slice(0, 7);
  const tikTokAdsMonthTotal = useMemo(
    () => weeklyExpenses.filter((e) => e.category === "TIKTOK_ADS" && e.date.slice(0, 7) === thisMonthIsoForAds).reduce((s, e) => s + e.amount, 0),
    [weeklyExpenses, thisMonthIsoForAds]
  );

  // Employee-submitted expense requests (TikTok ads / unit expenses not
  // otherwise covered) — approved ones are already-real money, same
  // treatment as the Admin-logged TikTok ad spend above; pending ones are
  // a possible future cost, folded into Forecast only, never Realized.
  // Rejected ones (excluded from the server query entirely) never count.
  const approvedExpenseRequestsMonthTotal = useMemo(
    () => expenseRequestsMonth.filter((e) => e.status === "APPROVED").reduce((s, e) => s + e.amount, 0),
    [expenseRequestsMonth]
  );
  const pendingExpenseRequestsMonthTotal = useMemo(
    () => expenseRequestsMonth.filter((e) => e.status === "PENDING").reduce((s, e) => s + e.amount, 0),
    [expenseRequestsMonth]
  );

  // Realized profit = revenue from stays that actually happened, minus
  // expenses actually paid, minus payroll actually accrued to date. Only
  // ever reflects money that has genuinely moved. All in centavos through
  // the subtraction itself, so a recurring expense's cents are actually
  // reflected — only the final StatCard values round to whole pesos.
  const realizedCostsCentavos = accruedStaffSalary * 100 + tikTokAdsMonthTotal * 100 + approvedExpenseRequestsMonthTotal * 100;
  const netProfitCents = computeNetProfitCentavos({
    revenueCentavos: completedMonthIncome * 100,
    paidExpensesCentavos: billsPaidMonthCentavos,
    otherPaidCostsCentavos: realizedCostsCentavos,
  });
  // Always floored at ₱0 for display — this business never wants to see a
  // negative headline number here, whether that's because no stays have
  // completed yet or because accrued costs genuinely outpaced revenue this
  // period. The raw (possibly negative) figure still drives the amber
  // "caution" styling below, so a real loss period is still visually
  // flagged — it just never renders as a negative peso amount. The full
  // cost breakdown stays visible in the caption underneath either way.
  const netProfitRaw = Math.round(netProfitCents / 100);
  const netProfit = Math.max(0, netProfitRaw);
  const marginRaw = marginPct(netProfitCents, completedMonthIncome * 100);
  const margin = Math.max(0, marginRaw);
  // Cash flow stays revenue-in-hand (DP + collected balances, same as
  // before) since it's about money that's actually moved, not which stays
  // are done — but it now deducts only accrued payroll too, for the same
  // reason Realized profit does. Same always-floored display rule.
  const cashFlowRaw = Math.round(
    cashFlowCentavos({ revenueCentavos: monthIncome * 100, paidExpensesCentavos: billsPaidMonthCentavos, otherPaidCostsCentavos: realizedCostsCentavos }) / 100
  );
  const cashFlow = Math.max(0, cashFlowRaw);

  // Forecast profit = what the rest of this month still owes/expects:
  // every booking's full value (whether collected yet or not) minus bills
  // still outstanding minus payroll not yet accrued. A projection, not
  // actual money — shown with its own distinct styling so it's never
  // mistaken for Realized profit.
  const forecastProfitCents = computeNetProfitCentavos({
    revenueCentavos: expectedMonthIncome * 100,
    paidExpensesCentavos: billsDueMonthCentavos,
    otherPaidCostsCentavos: upcomingStaffSalary * 100 + pendingExpenseRequestsMonthTotal * 100,
  });
  const forecastProfit = Math.round(forecastProfitCents / 100);

  return {
    monthIncome,
    completedMonthIncome,
    expectedMonthIncome,
    monthlyStaffSalary,
    accruedStaffSalary,
    upcomingStaffSalary,
    netProfitCents,
    netProfitRaw,
    netProfit,
    marginRaw,
    margin,
    cashFlowRaw,
    cashFlow,
    forecastProfitCents,
    forecastProfit,
  };
}
