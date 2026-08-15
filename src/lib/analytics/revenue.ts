import { manilaDayKey, manilaNowPlaceholder } from "@/lib/analytics/period";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { occupiedRange } from "@/lib/stayRange";
import { totalCollectedCentavos, collectedAmountCentavos, grossAmountCentavos, type CollectibleBooking } from "@/lib/finance";

export type RevenueBooking = CollectibleBooking & {
  cancelledAt?: string | Date | null;
};

/**
 * Collected-or-committed revenue, in centavos — delegates to
 * totalCollectedCentavos (@/lib/finance.ts), the app's one real source of
 * truth for this formula. Previously hand-rolled here with a stricter
 * cancelled-exclusion rule that zeroed out a cancelled-but-kept-deposit
 * booking entirely — see collectedAmountPesos's doc comment for why that
 * was a real, confirmed inconsistency against Dashboard's own revenue
 * figures for the same bookings, not the deliberate choice this
 * function's own (now-removed) comment claimed it was.
 */
export function collectedRevenueCentavos(bookings: RevenueBooking[]): number {
  return totalCollectedCentavos(bookings);
}

/**
 * The one shared definition of "so far this period" — bookings dated
 * before now (or the period's own end, whichever comes first). Both
 * Dashboard's "You've earned this month" headline (useEarningsData.ts) and
 * Analytics' "This month's revenue" Hero/KPI card (analytics/queries.ts)
 * call this exact function now, instead of each independently deciding
 * what "elapsed" means — confirmed live to disagree by ~₱14,000 for the
 * same real August bookings before this fix (Dashboard summed the whole
 * month including confirmed future-dated stays; Analytics excluded them).
 * `now` defaults to the same Manila-placeholder "now" every other period
 * boundary in this app uses (see manilaNowPlaceholder's own doc comment)
 * so this never mixes a true UTC instant against a placeholder boundary.
 */
export function elapsedBookings<T extends { date: string | Date }>(
  bookings: T[],
  periodEnd: Date,
  now: Date = manilaNowPlaceholder()
): T[] {
  const cutoff = new Date(Math.min(periodEnd.getTime(), now.getTime()));
  return bookings.filter((b) => new Date(b.date).getTime() < cutoff.getTime());
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
  checkOutDate: string | Date | null;
  stayType: string;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
  refundedAt?: string | Date | null;
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
 *
 * A multi-night stay's value is spread evenly across every night it
 * actually occupies (via the same occupiedRange used by Occupancy/ADR),
 * not dumped entirely onto its check-in date — otherwise a single 10-night
 * booking reads as one enormous spike on one day instead of ~10 ordinary
 * days, which used to make the trend chart (and any single-day KPI read)
 * misleading for long stays. Each stay's nights are clipped to
 * [periodStart, periodEnd) so revenue never spills into buckets outside
 * the range the caller actually queried bookings for.
 */
export function revenueSeries(
  bookings: SeriesBooking[],
  granularity: "day" | "week" | "month",
  periodStart: Date,
  periodEnd: Date
): RevenuePoint[] {
  const keyFor = granularity === "day" ? (d: Date) => manilaDayKey(d) : granularity === "week" ? weekKey : monthKey;
  const buckets = new Map<string, { grossCentavos: number; collectedCentavos: number }>();
  for (const b of bookings) {
    // Gross and Collected have two genuinely different exclusion rules,
    // not the one shared "skip if cancelled" condition this loop used to
    // have: Gross excludes cancelled bookings entirely regardless of
    // refund (matches the established grossRevenueCentavos convention —
    // the sale happened, a later refund doesn't undo that it was gross
    // revenue at the time). Collected is money actually kept — zeroed by
    // a refund, but NOT by a bare cancellation with a kept deposit. The
    // old code's single `if (cancelledAt) continue` meant a
    // cancelled-but-kept-deposit booking's real collected money never
    // appeared in this trend chart at all, AND a refunded-but-not-
    // cancelled booking's already-given-back money was wrongly still
    // counted as collected (refundedAt was never even checked here).
    const collectedTotal = collectedAmountCentavos(b);
    if (b.cancelledAt && collectedTotal === 0) continue; // genuinely nothing to spread
    const checkOutDate = b.checkOutDate ? new Date(b.checkOutDate) : null;
    const { start, end } = occupiedRange(b.stayType, new Date(b.date), checkOutDate);
    const totalNights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const grossPerNight = b.cancelledAt ? 0 : grossAmountCentavos(b) / totalNights;
    const collectedPerNight = collectedTotal / totalNights;
    const clipStart = start.getTime() > periodStart.getTime() ? start : periodStart;
    const clipEnd = end.getTime() < periodEnd.getTime() ? end : periodEnd;
    for (let t = clipStart.getTime(); t < clipEnd.getTime(); t += 86400000) {
      const key = keyFor(new Date(t));
      const entry = buckets.get(key) ?? { grossCentavos: 0, collectedCentavos: 0 };
      entry.grossCentavos += grossPerNight;
      entry.collectedCentavos += collectedPerNight;
      buckets.set(key, entry);
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bucket, v]) => ({ bucket, grossCentavos: Math.round(v.grossCentavos), collectedCentavos: Math.round(v.collectedCentavos) }));
}

export type DimensionBooking = {
  unitId: string;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
  refundedAt?: string | Date | null;
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
    // Same Gross-vs-Collected distinction as revenueSeries above: Gross
    // (and count) exclude cancelled bookings entirely, Collected only
    // excludes a refund. The old single `if (cancelledAt) continue` hid a
    // cancelled-but-kept-deposit booking's real collected money from
    // every one of these breakdowns (Revenue by unit/source/stay
    // type/payment method), and never accounted for refundedAt at all.
    const collectedTotal = collectedAmountCentavos(b);
    if (b.cancelledAt && collectedTotal === 0) continue;
    const { key, label } = keyFor(b);
    const row = rows.get(key) ?? { key, label, grossCentavos: 0, collectedCentavos: 0, count: 0 };
    row.collectedCentavos += collectedTotal;
    if (!b.cancelledAt) {
      row.grossCentavos += grossAmountCentavos(b);
      row.count += 1;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.collectedCentavos - a.collectedCentavos);
}
