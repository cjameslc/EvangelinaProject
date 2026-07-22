export type RevenueBooking = {
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
};

/**
 * Collected-or-committed revenue, in centavos — same recognition rule
 * already used across this app (Dashboard's `income`/`periodIncome`):
 * the full amount once paid, plus any downpayment on file regardless of
 * paid status. Excludes cancelled bookings (a cancelled stay was never
 * really revenue, whatever was collected on it becomes a refund concern,
 * not income — see the Refunds exclusion note in the module's open
 * decisions).
 */
export function collectedRevenueCentavos(bookings: RevenueBooking[]): number {
  return bookings.reduce((sum, b) => {
    if (b.cancelledAt) return sum;
    return sum + ((b.paid ? b.amount : 0) + (b.dpAmount || 0)) * 100;
  }, 0);
}

/**
 * Period-over-period growth, as a whole-number percent. Returns `null`
 * (never a fabricated 0% or +∞%) when there's no prior-period baseline to
 * compare against — e.g. the very first period this business has data for.
 */
export function revenueGrowthPct(currentCentavos: number, previousCentavos: number): number | null {
  if (previousCentavos <= 0) return null;
  return Math.round(((currentCentavos - previousCentavos) / previousCentavos) * 100);
}
