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

export type OutstandingBooking = { amount: number; paid: boolean; dpAmount: number | null; cancelledAt?: string | Date | null };

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
