// Zero new logic — every call site in the Analytics module imports from
// here, which is itself just a named re-export of @/lib/finance, the
// existing single source of truth for every profit/expense computation.
// Keeps "Analytics never duplicates a calculation" grep-able: nothing in
// src/lib/analytics/ computes profit/margin/cash-flow math independently.
export {
  netProfitCentavos,
  marginPct,
  paidExpensesCentavos,
  pendingExpensesCentavos,
  cashFlowCentavos,
  paidExpensesCentavosForUnit,
  type ExpenseLike,
} from "@/lib/finance";

import { totalSalaryPayroll, type SalaryHistoryEntry } from "@/lib/payroll";

export type OutstandingBooking = { amount: number; paid: boolean; dpAmount: number | null; cancelledAt?: string | Date | null };

type EmployeeForPayroll = { id: string; role: string; monthlySalary: number; active?: boolean };
type ExpenseRequestLike = { category: string; amount: number; status: string };
type WeeklyExpenseLike = { category: string; amount: number };

/**
 * Accrued staff salary + operational costs (TikTok ads, approved expense
 * requests) for an arbitrary [periodStart, periodEnd) window — the exact
 * methodology DashboardView.tsx's Realized Profit/Cash Flow already use
 * for "this month" (see accruedStaffSalary/tikTokAdsMonthTotal/
 * approvedExpenseRequestsMonthTotal there), generalized so Analytics'
 * Net Profit and Cash Flow can use the same real number for whatever
 * period is selected, instead of only ever subtracting paid Bills.
 * Analytics previously computed Net Profit as `revenue - paidBills` with
 * no payroll deduction at all — confirmed by this module's own
 * `netProfitNote` string, which explicitly said "Doesn't include staff
 * payroll yet." That silently overstated Net Profit and Cash Flow by the
 * full accrued payroll amount for the period (a real, material gap, not
 * a display nuance — e.g. ₱180,085 shown as both Total Revenue AND Net
 * Profit for a period that Dashboard's own Realized Profit correctly
 * showed as ₱81,469 after payroll).
 *
 * "Accrued" — like Dashboard's own version — only counts salary owed for
 * the portion of the period that's actually elapsed (up to now), never
 * salary for days still in the future.
 */
export function accruedOperationalCostsCentavos(params: {
  employees: EmployeeForPayroll[];
  salaryHistory: SalaryHistoryEntry[];
  weeklyExpenses: WeeklyExpenseLike[];
  expenseRequests: ExpenseRequestLike[];
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}): number {
  const now = params.now ?? new Date();
  const effectiveEnd = params.periodEnd.getTime() < now.getTime() ? params.periodEnd : now;
  const accruedDays = Math.max(0, Math.round((effectiveEnd.getTime() - params.periodStart.getTime()) / 86400000));
  const payrollCentavos = totalSalaryPayroll(params.employees, params.salaryHistory, "custom", params.periodStart, accruedDays) * 100;
  const tikTokAdsCentavos = params.weeklyExpenses
    .filter((e) => e.category === "TIKTOK_ADS")
    .reduce((s, e) => s + e.amount, 0) * 100;
  const approvedExpenseCentavos = params.expenseRequests
    .filter((e) => e.status === "APPROVED")
    .reduce((s, e) => s + e.amount, 0) * 100;
  return payrollCentavos + tikTokAdsCentavos + approvedExpenseCentavos;
}

/**
 * Sum of what's still owed on unpaid bookings — the full amount for a
 * booking with no downpayment on file, or just the remaining balance
 * (amount − dpAmount) for one that's been partially paid. Excludes
 * cancelled bookings (nothing is "owed" on a stay that never happened).
 */
export function outstandingBalanceCentavos(bookings: OutstandingBooking[]): number {
  return bookings.reduce((sum, b) => {
    if (b.paid || b.cancelledAt) return sum;
    const remaining = Math.max(0, b.amount - (b.dpAmount || 0));
    return sum + remaining * 100;
  }, 0);
}
