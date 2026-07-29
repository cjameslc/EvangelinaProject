// Single source of truth for every profit/cash-flow computation that
// touches expenses (Bills). Cash-based accounting: an expense only affects
// Net Profit, Profit Margin, or Cash Flow once it's actually been paid.
// Creating, scheduling, or otherwise marking a bill Pending/Due/Overdue
// never reduces any financial metric — it only becomes real money out the
// door (and thus a deduction) the moment `paid` flips to true. Every page
// that needs Net Profit/Margin/Cash Flow/expense totals should compute
// through the functions here rather than re-deriving the formula, so the
// rule can't drift out of sync between Dashboard, reports, and any future
// per-unit or portfolio view.
//
// Note on status vocabulary: this app's Bill model tracks a single boolean
// (`paid`), not a richer status enum (Scheduled/Due/Overdue/Processing/
// Cancelled). Those labels are all, for financial-computation purposes,
// synonyms for "not yet paid" — every one of them is excluded here exactly
// like Pending is. The Dashboard/Bills UI separately derives "Overdue" vs
// "Due soon" badges from each bill's due date for display, but that's a
// presentation detail layered on top of the same underlying paid/unpaid
// split, never a second, competing inclusion rule.

import { billCentavos, billPaidCentavos } from "./format";

export type ExpenseLike = {
  paid: boolean;
  amountDue: number;
  amountPaid: number | null;
  amountDueCentavos?: number | null;
  amountPaidCentavos?: number | null;
};

/** Sum of every expense actually marked paid — the only bucket allowed to reduce a financial metric. */
export function paidExpensesCentavos(expenses: ExpenseLike[]): number {
  return expenses.reduce((s, e) => s + billPaidCentavos(e), 0);
}

/** Sum of every expense NOT yet paid (Pending/Scheduled/Due/Overdue/Processing, in whatever terms the UI shows) — informational only, must never be subtracted from profit/cash-flow. */
export function pendingExpensesCentavos(expenses: ExpenseLike[]): number {
  return expenses.reduce((s, e) => s + (e.paid ? 0 : billCentavos(e)), 0);
}

/**
 * Net Profit = Revenue − Paid expenses − other already-incurred costs
 * (e.g. this period's staff salary, which this app always treats as owed
 * regardless of a separate "salary paid" flag — there's no such status to
 * track for payroll, so it's passed in as a flat cost by the caller).
 * Everything stays in centavos until the caller rounds for display.
 */
export function netProfitCentavos(params: { revenueCentavos: number; paidExpensesCentavos: number; otherPaidCostsCentavos?: number }): number {
  return params.revenueCentavos - params.paidExpensesCentavos - (params.otherPaidCostsCentavos ?? 0);
}

/** Profit margin as a whole-number percent of revenue; 0 when there's no revenue to divide by. */
export function marginPct(netProfitCents: number, revenueCentavos: number): number {
  return revenueCentavos > 0 ? Math.round((netProfitCents / revenueCentavos) * 100) : 0;
}

/**
 * Cash Flow — same paid-only rule as Net Profit. Kept as a distinct
 * function (rather than a bare alias) so a future cash-specific rule
 * (e.g. counting a downpayment collected but not yet the full booking
 * amount) has one clear place to diverge without touching Net Profit.
 */
export function cashFlowCentavos(params: { revenueCentavos: number; paidExpensesCentavos: number; otherPaidCostsCentavos?: number }): number {
  return netProfitCentavos(params);
}

/** Per-unit paid-only expense total — e.g. for a future unit-profitability view. Unpaid bills stay visible in the UI but never reach this sum. */
export function paidExpensesCentavosForUnit(expenses: (ExpenseLike & { unitId: string | null })[], unitId: string): number {
  return paidExpensesCentavos(expenses.filter((e) => e.unitId === unitId));
}

export type CollectibleBooking = { amount: number; paid: boolean; dpAmount: number | null; refundedAt?: string | Date | null };

/**
 * Money actually in hand for one booking, in whole pesos — the full amount
 * once paid, plus any downpayment on file, minus anything given back via a
 * refund. A cancelled booking's kept deposit still counts (same "money
 * kept, not refunded" rule isCommissionEligible uses in bookingStatus.ts)
 * — only a refund zeroes it out, a bare cancellation on its own never
 * does. The single source of truth this formula should have always had:
 * before this, it was hand-rolled independently in six places (Dashboard,
 * BookingsView ×2, revenueGoals.ts, the gamification Teams API, and
 * Analytics' revenue.ts/guests.ts) — two of those six (Analytics'
 * collectedRevenueCentavos and guestLifetimeValue) used a *different*,
 * stricter rule that zeroed out a cancelled-but-kept-deposit booking
 * entirely, rather than only on an actual refund. That meant Analytics'
 * Total Revenue and Top/Frequent Guests could read lower than Dashboard's
 * own Income figures for the exact same real bookings — a real,
 * confirmed inconsistency, not a rounding nuance. Both of collected-
 * revenue.ts's/guests.ts's own comments claimed to already match this
 * formula; they didn't.
 */
export function collectedAmountPesos(b: CollectibleBooking): number {
  if (b.refundedAt) return 0;
  return (b.paid ? b.amount : 0) + (b.dpAmount || 0);
}

/** Same as collectedAmountPesos, in centavos — for callers already working in centavos throughout (Analytics). */
export function collectedAmountCentavos(b: CollectibleBooking): number {
  return collectedAmountPesos(b) * 100;
}

/** Sum of collectedAmountCentavos across a list of bookings. */
export function totalCollectedCentavos(bookings: CollectibleBooking[]): number {
  return bookings.reduce((sum, b) => sum + collectedAmountCentavos(b), 0);
}
