import { manilaDayKey } from "@/lib/analytics/period";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";

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

export type SeriesBooking = {
  date: string | Date;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
};

export type RevenuePoint = { bucket: string; grossCentavos: number; collectedCentavos: number; bookingId?: never };

function weekKey(d: Date): string {
  // Sunday-anchored week start, in Manila calendar terms — matches the
  // "weekly" period bucketing every other period function in this app uses.
  const [y, m, day] = manilaDayKey(d).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());
  return manilaDayKey(anchor);
}

function monthKey(d: Date): string {
  return manilaDayKey(d).slice(0, 7); // YYYY-MM
}

/**
 * Revenue bucketed by day/week/month, oldest first — the input for the
 * Revenue trend chart. "Gross" is every booking's full value regardless of
 * paid status (what's been committed); "collected" is cash actually in
 * hand (paid amount + any downpayment) — same distinction Dashboard
 * already draws between Forecast and Realized figures, just applied per
 * bucket here instead of for one period total.
 */
export function revenueSeries(bookings: SeriesBooking[], granularity: "day" | "week" | "month"): RevenuePoint[] {
  const keyFor = granularity === "day" ? (d: Date) => manilaDayKey(d) : granularity === "week" ? weekKey : monthKey;
  const buckets = new Map<string, { grossCentavos: number; collectedCentavos: number }>();
  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const key = keyFor(new Date(b.date));
    const entry = buckets.get(key) ?? { grossCentavos: 0, collectedCentavos: 0 };
    entry.grossCentavos += b.amount * 100;
    entry.collectedCentavos += ((b.paid ? b.amount : 0) + (b.dpAmount || 0)) * 100;
    buckets.set(key, entry);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bucket, v]) => ({ bucket, ...v }));
}

export type DimensionBooking = {
  unitId: string;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
  platform: string;
  stayType: string;
  method: string | null;
};

export type RevenueDimensionRow = { key: string; label: string; grossCentavos: number; collectedCentavos: number; count: number };

/**
 * Revenue grouped by one dimension at a time — one parameterized function
 * instead of near-duplicate ones per dimension. "unit" doubles as
 * "property" (this business's 5 units ARE its properties — there's no
 * separate property-groups-multiple-units model here, so a distinct
 * Property dimension would just repeat Unit). "source" reads
 * `Booking.platform` (the marketing channel — Airbnb/TikTok/Facebook/
 * Walk-in/Direct/Other), deliberately NOT `Booking.source`, which is the
 * unrelated iCal entry-channel field.
 */
export function revenueByDimension(
  bookings: DimensionBooking[],
  dimension: "unit" | "source" | "stayType" | "paymentMethod",
  unitLabels: Record<string, string> = {}
): RevenueDimensionRow[] {
  const keyFor = (b: DimensionBooking): { key: string; label: string } => {
    if (dimension === "unit") return { key: b.unitId, label: unitLabels[b.unitId] ?? b.unitId };
    if (dimension === "source") return { key: b.platform, label: b.platform };
    if (dimension === "stayType") return { key: b.stayType, label: b.stayType };
    // Airbnb bookings never have a manually-recorded method (they're
    // auto-imported via iCal, not entered through the payment flow), but
    // Airbnb payouts to the host always arrive by bank transfer — so for
    // this metric they're counted as BankTransfer rather than falling into
    // an "Unrecorded" bucket that would otherwise just mean "Airbnb."
    const method = b.platform === "Airbnb" ? "BankTransfer" : b.method || "Unrecorded";
    return { key: method, label: PAYMENT_METHOD_LABEL[method] ?? method };
  };
  const rows = new Map<string, RevenueDimensionRow>();
  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const { key, label } = keyFor(b);
    const row = rows.get(key) ?? { key, label, grossCentavos: 0, collectedCentavos: 0, count: 0 };
    row.grossCentavos += b.amount * 100;
    row.collectedCentavos += ((b.paid ? b.amount : 0) + (b.dpAmount || 0)) * 100;
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.collectedCentavos - a.collectedCentavos);
}
