// Forecast & Predictive Analytics — the one centralized forecasting
// service every Metrics-tab forecast figure is computed through (section
// 18 of the brief this was built from: "one calculation, one source of
// truth, multiple metrics"). Every function here is a pure composition of
// the app's existing, already-verified primitives — collectedAmountPesos/
// grossAmountCentavos (finance.ts), computeOccupancy/computeADR/computeRevPAR
// (occupancy.ts), revenueByDimension (revenue.ts), cancellationRate
// (bookings.ts), netProfitCentavos (financials.ts), trailingAverageForecast
// (forecast.ts) — never a second, competing formula for something that
// already has a real one.
//
// Forecast methodology, stated once here so every function's comment can
// point back to it instead of re-explaining:
//   - ACTUAL = money/nights already realized (elapsed bookings only).
//   - CONFIRMED = the full contract value of real bookings already on the
//     books with a future check-in date this period (gross, not just what's
//     been collected yet — the reservation is real regardless of payment
//     timing).
//   - FORECAST = predicted ADDITIONAL revenue/bookings not yet on the
//     books, for the period's remaining days. Blended from two real
//     signals: (a) this period's own elapsed daily pace, and (b) the
//     trailing prior periods' average daily pace (trailingAverageForecast).
//     Blend weight shifts toward (a) as more of the period elapses — early
//     in a period there's too little of (a) to trust alone, late in a
//     period (a) is the far better predictor. This is the same "don't
//     overstate an early-period projection" reasoning revenueGoals.ts's
//     confidence field already uses, applied to the blend weight instead.
//   - PROJECTED = Actual + Confirmed + Forecast.
//   - This app has under 6 months of real (non-backfilled-only) history at
//     the time this was built — every confidence score here is deliberately
//     capped low/medium rather than ever claiming "high" until there's
//     enough real history to earn it. See computeForecastConfidence.

import { collectedAmountPesos, grossAmountPesos } from "@/lib/finance";
import { type OccupancyBooking } from "@/lib/analytics/occupancy";
import { revenueByDimension, type DimensionBooking } from "@/lib/analytics/revenue";
import { trailingAverageForecast } from "@/lib/analytics/forecast";
import { type UnitPerformanceRow } from "@/lib/analytics/units";
import { manilaDayKey } from "@/lib/analytics/period";
import { occupiedRange } from "@/lib/stayRange";

export type ForecastBooking = {
  id: string;
  unitId: string;
  bookerId: string | null;
  stayType: string;
  platform: string;
  date: string | Date;
  checkOutDate: string | Date | null;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
  refundedAt?: string | Date | null;
};

// ---------------------------------------------------------------------
// Confidence — section 12. A weighted composite of real, computable
// signals; the ones the brief names that this app has no data source for
// (a tracked history of past-forecast-vs-actual error) are documented as
// omitted, not silently faked. Never returns a bare number without the
// qualitative band next to it, and never reaches "high" without genuinely
// enough history to justify it — see the module doc comment.
// ---------------------------------------------------------------------

export type ConfidenceBand = "insufficient" | "low" | "medium" | "high";
export type ConfidenceResult = { score: number; band: ConfidenceBand; label: string; factors: { label: string; weight: number; score: number }[] };

export function computeForecastConfidence(params: {
  trailingPeriodCount: number; // complete prior periods with real data (not backfilled-only)
  currentPeriodBookingCount: number;
  elapsedFraction: number; // 0-1, how much of the current period has passed
  dailyPaceCoefficientOfVariation: number | null; // stdev/mean of daily pace across trailing periods; null if unknown
  cancellationRatePct: number;
  remainingAvailableNights: number;
}): ConfidenceResult {
  const { trailingPeriodCount, currentPeriodBookingCount, elapsedFraction, dailyPaceCoefficientOfVariation, cancellationRatePct, remainingAvailableNights } = params;

  if (currentPeriodBookingCount === 0 && trailingPeriodCount === 0) {
    return { score: 0, band: "insufficient", label: "Insufficient Confidence — Insufficient historical data", factors: [] };
  }

  // Historical data volume — this app has at most a handful of real
  // months; capped well short of full marks so a genuinely young business
  // never sees an inflated score just because it happens to have "enough"
  // by an arbitrary threshold.
  const historyScore = Math.min(100, trailingPeriodCount * 20); // 5 periods -> 100
  // Current booking volume — more bookings this period, more signal to
  // forecast from.
  const volumeScore = Math.min(100, currentPeriodBookingCount * 4); // 25 bookings -> 100
  // How far into the period we are — a forecast made on day 1 is a guess;
  // one made on day 25 of 30 is mostly already observed.
  const elapsedScore = Math.round(elapsedFraction * 100);
  // Booking consistency — lower variance in trailing daily pace = more
  // predictable = higher confidence. No variance data yet (fewer than 2
  // trailing periods) scores neutrally rather than being penalized for
  // something it can't know.
  const consistencyScore = dailyPaceCoefficientOfVariation === null ? 50 : Math.round(Math.max(0, 100 - dailyPaceCoefficientOfVariation * 100));
  // Cancellations directly erode how much of "confirmed" revenue actually
  // materializes — a high cancellation rate should pull confidence down.
  const cancellationScore = Math.max(0, 100 - cancellationRatePct * 2);
  // Remaining inventory — forecasting 1 remaining bookable night is far
  // less meaningful than forecasting 60.
  const inventoryScore = Math.min(100, remainingAvailableNights * 3);

  const weighted = [
    { label: "Historical data volume", weight: 0.25, score: historyScore },
    { label: "Current booking volume", weight: 0.2, score: volumeScore },
    { label: "Period elapsed", weight: 0.15, score: elapsedScore },
    { label: "Booking consistency", weight: 0.15, score: consistencyScore },
    { label: "Cancellation rate", weight: 0.1, score: cancellationScore },
    { label: "Remaining inventory", weight: 0.15, score: inventoryScore },
  ];
  const raw = weighted.reduce((s, f) => s + f.weight * f.score, 0);
  // Hard cap: with fewer than 3 trailing periods of real history, this
  // business simply hasn't been observed long enough to claim "high"
  // confidence in anything, regardless of how good the other factors look
  // — see the module doc comment.
  const score = Math.round(trailingPeriodCount < 3 ? Math.min(raw, 70) : raw);

  const band: ConfidenceBand = score < 25 ? "insufficient" : score < 50 ? "low" : score < 75 ? "medium" : "high";
  const bandLabel = band === "insufficient" ? "Insufficient Confidence — Insufficient historical data" : band === "low" ? "Low" : band === "medium" ? "Medium" : "High";
  return { score, band, label: `${score}% — ${bandLabel}`, factors: weighted };
}

// ---------------------------------------------------------------------
// Monthly forecast summary — sections 1, 2, 3, 11.
// ---------------------------------------------------------------------

export type ScenarioResult = { revenueCentavos: number; occupancyPct: number; netProfitCentavos: number };

export type MonthlyForecastSummary = {
  actualRevenueCentavos: number;
  confirmedFutureRevenueCentavos: number;
  forecastAdditionalRevenueCentavos: number;
  projectedRevenueCentavos: number;
  projectedNetProfitCentavos: number;
  projectedOccupancyPct: number;
  targetPesos: number;
  targetAchievementPct: number;
  remainingPesos: number;
  targetProbabilityPct: number | null; // null when confidence is insufficient to state one
  confidence: ConfidenceResult;
  scenarios: { conservative: ScenarioResult; expected: ScenarioResult; optimistic: ScenarioResult };
  pace: {
    revenueActualToDatePesos: number;
    historicalExpectedAtSamePointPesos: number | null;
    revenuePacePct: number | null; // null when there's no historical baseline to compare against
    bookingPacePct: number | null;
    occupancyPacePct: number | null;
    profitPacePct: number | null;
    daysElapsed: number;
    daysRemaining: number;
    remainingAvailableNights: number;
  };
};

/**
 * The one "how are we doing this month, and how will it end" computation.
 * `trailingMonthTotals`/`trailingMonthBookingCounts`/`trailingMonthOccupancyPct`
 * should be the last up-to-3 COMPLETE prior calendar months, oldest first
 * (same convention fetchKpiData's own trailingMonths already uses) — used
 * for the pace blend and confidence, never for Actual/Confirmed, which are
 * always this period's own real bookings.
 */
export function computeMonthlyForecastSummary(params: {
  currentMonthBookings: ForecastBooking[]; // every non-cancelled booking with a check-in this month (past or future)
  now: Date;
  monthStart: Date;
  monthEnd: Date;
  targetPesos: number;
  unitCount: number;
  maintenanceNightsRemaining: number; // maintenance-blocked nights still ahead this month, reduces remaining available inventory
  trailingMonthRevenuePesos: number[]; // oldest first
  trailingMonthBookingCounts: number[];
  trailingMonthOccupancyPct: number[];
  cancellationRatePct: number;
  currentMonthNetProfitSoFarCentavos: number; // real, already-accrued net profit (paid bills + accrued payroll) for the elapsed portion
  /** The real, nights-based occupancy% for the elapsed portion of this month so far — computed by the caller via computeOccupancy (occupancy.ts), never approximated here from booking counts (a booking-count proxy silently undercounts a multi-night stay and was a confirmed real bug class elsewhere in this app). */
  actualOccupancyPctSoFar: number;
}): MonthlyForecastSummary {
  const {
    currentMonthBookings, now, monthStart, monthEnd, targetPesos, unitCount, maintenanceNightsRemaining,
    trailingMonthRevenuePesos, trailingMonthBookingCounts, trailingMonthOccupancyPct, cancellationRatePct, currentMonthNetProfitSoFarCentavos,
    actualOccupancyPctSoFar,
  } = params;

  const daysInMonth = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000));
  const rawElapsed = Math.floor((now.getTime() - monthStart.getTime()) / 86400000) + 1;
  const daysElapsed = Math.min(Math.max(rawElapsed, 1), daysInMonth);
  const daysRemaining = Math.max(daysInMonth - daysElapsed, 0);
  const cutoff = new Date(Math.min(monthEnd.getTime(), now.getTime()));

  const elapsed = currentMonthBookings.filter((b) => !b.cancelledAt && new Date(b.date).getTime() < cutoff.getTime());
  const future = currentMonthBookings.filter((b) => !b.cancelledAt && new Date(b.date).getTime() >= cutoff.getTime());

  const actualRevenueCentavos = Math.round(elapsed.reduce((s, b) => s + collectedAmountPesos(b), 0) * 100);
  const confirmedFutureRevenueCentavos = Math.round(future.reduce((s, b) => s + grossAmountPesos(b), 0) * 100);

  const dailyPaceCentavos = daysElapsed > 0 ? actualRevenueCentavos / daysElapsed : 0;
  const trailingDailyPacesCentavos = trailingMonthRevenuePesos.map((p) => (p * 100) / daysInMonth);
  const trailingForecast = trailingAverageForecast(trailingDailyPacesCentavos);

  // Blend weight shifts toward the current month's own pace as more of it
  // elapses — see the module doc comment for why.
  const elapsedFrac = daysElapsed / daysInMonth;
  const blendedDailyPaceCentavos = trailingForecast.forecastCentavos > 0
    ? dailyPaceCentavos * elapsedFrac + trailingForecast.forecastCentavos * (1 - elapsedFrac)
    : dailyPaceCentavos;
  const forecastAdditionalRevenueCentavos = Math.max(0, Math.round(blendedDailyPaceCentavos * daysRemaining - confirmedFutureRevenueCentavos));

  const projectedRevenueCentavos = actualRevenueCentavos + confirmedFutureRevenueCentavos + forecastAdditionalRevenueCentavos;

  // Profit is projected off the REAL realized margin so far this month —
  // reusing the actual rate rather than inventing a separate expense
  // forecast model. Falls back to a portfolio-flat 0 margin (never a
  // fabricated guess) if there's no realized revenue yet to derive a rate
  // from.
  const realizedMarginRate = actualRevenueCentavos > 0 ? currentMonthNetProfitSoFarCentavos / actualRevenueCentavos : 0;
  const projectedNetProfitCentavos = Math.round(projectedRevenueCentavos * realizedMarginRate);

  const targetAchievementPct = targetPesos > 0 ? Math.round((projectedRevenueCentavos / 100 / targetPesos) * 100) : 0;
  const remainingPesos = Math.max(0, targetPesos - projectedRevenueCentavos / 100);

  // Occupancy pace blends the same way revenue does — this month's own
  // real elapsed occupancy (actualOccupancyPctSoFar, nights-based, from
  // the caller) weighted toward as more of the month elapses, trailing
  // months' occupancy% filling in the remaining-days estimate.
  const trailingOccForecast = trailingAverageForecast(trailingMonthOccupancyPct.map((p) => Math.round(p * 100))); // scaled to "centavos" units so trailingAverageForecast's own rounding stays meaningful
  const trailingOccPct = trailingOccForecast.forecastCentavos / 100;
  const projectedOccupancyPct = Math.round(
    trailingOccForecast.forecastCentavos > 0
      ? actualOccupancyPctSoFar * elapsedFrac + trailingOccPct * (1 - elapsedFrac)
      : actualOccupancyPctSoFar
  );

  // Confidence + probability.
  const paceCVs = trailingDailyPacesCentavos.length >= 2
    ? (() => {
        const mean = trailingDailyPacesCentavos.reduce((s, v) => s + v, 0) / trailingDailyPacesCentavos.length;
        if (mean <= 0) return null;
        const variance = trailingDailyPacesCentavos.reduce((s, v) => s + (v - mean) ** 2, 0) / trailingDailyPacesCentavos.length;
        return Math.sqrt(variance) / mean;
      })()
    : null;
  const remainingAvailableNights = Math.max(0, unitCount * daysRemaining - maintenanceNightsRemaining);
  const confidence = computeForecastConfidence({
    trailingPeriodCount: trailingMonthRevenuePesos.length,
    currentPeriodBookingCount: elapsed.length,
    elapsedFraction: elapsedFrac,
    dailyPaceCoefficientOfVariation: paceCVs,
    cancellationRatePct,
    remainingAvailableNights,
  });

  // Target-hit probability — a simple, real, describable heuristic (never
  // a black-box model): how many "pace standard deviations" is the
  // required remaining daily average from the blended forecast pace,
  // mapped through a bounded logistic-like curve. With no real variance
  // signal (fewer than 2 trailing periods), no probability is stated at
  // all rather than inventing one — see targetProbabilityPct's null case.
  let targetProbabilityPct: number | null = null;
  if (paceCVs !== null && daysRemaining > 0) {
    const remainingTargetCentavos = Math.max(0, targetPesos * 100 - actualRevenueCentavos - confirmedFutureRevenueCentavos);
    const requiredDailyCentavos = remainingTargetCentavos / daysRemaining;
    const stdevCentavos = Math.max(1, blendedDailyPaceCentavos * paceCVs);
    const zLike = (blendedDailyPaceCentavos - requiredDailyCentavos) / stdevCentavos;
    // Logistic mapping, clamped and rounded to the nearest 5% — precision
    // beyond that would be false precision given the method.
    const raw = 1 / (1 + Math.exp(-zLike));
    targetProbabilityPct = Math.round((Math.min(0.97, Math.max(0.03, raw)) * 100) / 5) * 5;
  }

  // Three scenarios — Conservative assumes zero speculative forecast (the
  // real floor: only what's already realized or already booked).
  // Optimistic scales the forecast portion by the best-vs-average trailing
  // daily pace ratio actually observed, clamped to a sane band — a real
  // number derived from this business's own historical variance, not an
  // arbitrary multiplier.
  const bestTrailingPace = trailingDailyPacesCentavos.length > 0 ? Math.max(...trailingDailyPacesCentavos) : blendedDailyPaceCentavos;
  const avgTrailingPace = trailingDailyPacesCentavos.length > 0 ? trailingDailyPacesCentavos.reduce((s, v) => s + v, 0) / trailingDailyPacesCentavos.length : blendedDailyPaceCentavos;
  const upsideRatio = avgTrailingPace > 0 ? Math.min(1.5, Math.max(1, bestTrailingPace / avgTrailingPace)) : 1.15;

  const conservativeRevenueCentavos = actualRevenueCentavos + confirmedFutureRevenueCentavos;
  const expectedRevenueCentavos = projectedRevenueCentavos;
  const optimisticRevenueCentavos = actualRevenueCentavos + confirmedFutureRevenueCentavos + Math.round(forecastAdditionalRevenueCentavos * upsideRatio);

  // Conservative occupancy: the real, already-achieved figure only — no
  // projection at all, the honest floor.
  const scenarioProfit = (revCentavos: number) => Math.round(revCentavos * realizedMarginRate);

  const scenarios = {
    conservative: { revenueCentavos: conservativeRevenueCentavos, occupancyPct: Math.round(actualOccupancyPctSoFar), netProfitCentavos: scenarioProfit(conservativeRevenueCentavos) },
    expected: { revenueCentavos: expectedRevenueCentavos, occupancyPct: projectedOccupancyPct, netProfitCentavos: projectedNetProfitCentavos },
    optimistic: { revenueCentavos: optimisticRevenueCentavos, occupancyPct: Math.min(100, Math.round(projectedOccupancyPct * upsideRatio)), netProfitCentavos: scenarioProfit(optimisticRevenueCentavos) },
  };

  // Pace vs history — section 2.
  const historicalExpectedAtSamePointPesos = trailingMonthRevenuePesos.length > 0
    ? Math.round((trailingMonthRevenuePesos.reduce((s, v) => s + v, 0) / trailingMonthRevenuePesos.length) * elapsedFrac)
    : null;
  const revenuePacePct = historicalExpectedAtSamePointPesos && historicalExpectedAtSamePointPesos > 0
    ? Math.round((actualRevenueCentavos / 100 / historicalExpectedAtSamePointPesos) * 100)
    : null;
  const historicalBookingsAtSamePoint = trailingMonthBookingCounts.length > 0
    ? (trailingMonthBookingCounts.reduce((s, v) => s + v, 0) / trailingMonthBookingCounts.length) * elapsedFrac
    : null;
  const bookingPacePct = historicalBookingsAtSamePoint && historicalBookingsAtSamePoint > 0
    ? Math.round((elapsed.length / historicalBookingsAtSamePoint) * 100)
    : null;
  const historicalOccAtSamePoint = trailingMonthOccupancyPct.length > 0
    ? (trailingMonthOccupancyPct.reduce((s, v) => s + v, 0) / trailingMonthOccupancyPct.length)
    : null;
  const occupancyPacePct = historicalOccAtSamePoint && historicalOccAtSamePoint > 0 ? Math.round((actualOccupancyPctSoFar / historicalOccAtSamePoint) * 100) : null;
  const profitPacePct = revenuePacePct; // profit pace tracks revenue pace 1:1 under the realized-margin projection model — no separate historical profit series exists to compare against independently

  return {
    actualRevenueCentavos,
    confirmedFutureRevenueCentavos,
    forecastAdditionalRevenueCentavos,
    projectedRevenueCentavos,
    projectedNetProfitCentavos,
    projectedOccupancyPct,
    targetPesos,
    targetAchievementPct,
    remainingPesos,
    targetProbabilityPct,
    confidence,
    scenarios,
    pace: {
      revenueActualToDatePesos: actualRevenueCentavos / 100,
      historicalExpectedAtSamePointPesos,
      revenuePacePct,
      bookingPacePct,
      occupancyPacePct,
      profitPacePct,
      daysElapsed,
      daysRemaining,
      remainingAvailableNights,
    },
  };
}

// ---------------------------------------------------------------------
// Day-of-week forecast — section 10.
// ---------------------------------------------------------------------

export type WeekdayRow = {
  dow: number; // 0=Sun..6=Sat, Manila calendar
  label: string;
  avgBookings: number;
  avgRevenueCentavos: number;
  occupancyPct: number;
  adrCentavos: number;
  revparCentavos: number;
  forecastDemandIndex: number; // this weekday's avg revenue as % of the overall daily average — 100 = exactly average
};

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Historical weekday pattern over [periodStart, periodEnd) — real per-
 * day-of-week averages, spanning several real weeks so each weekday
 * bucket has more than one sample. "Bookings"/"Revenue" bucket by each
 * booking's own check-in weekday (when demand actually happens); occupancy
 * is properly nights-based — every booking's real occupied range
 * (occupiedRange, the same canonical decomposition revenueSeries/
 * computeOccupancy use) is walked night by night, each night bucketed by
 * ITS OWN weekday and deduped per (unit, night) — a booking-count proxy
 * would silently undercount a multi-night stay and misattribute which
 * nights were actually occupied, a real bug class this app has hit and
 * fixed before. Reused directly to weight the remaining-days forecast and
 * to answer "is Saturday really busier" (insight generation below).
 */
export function forecastByDayOfWeek(bookings: (OccupancyBooking & { unitId: string })[], unitCount: number, periodStart: Date, periodEnd: Date): WeekdayRow[] {
  const dowOf = (d: Date) => new Date(manilaDayKey(d) + "T00:00:00Z").getUTCDay();

  const bookingsByDow = new Map<number, number>();
  const revenueByDow = new Map<number, number>(); // centavos
  const occupiedNightsByDow = new Map<number, Set<string>>(); // "unitId|dateKey"
  const availableNightsByDow = new Map<number, number>();
  for (let d = 0; d < 7; d++) { bookingsByDow.set(d, 0); revenueByDow.set(d, 0); occupiedNightsByDow.set(d, new Set()); availableNightsByDow.set(d, 0); }

  for (let t = periodStart.getTime(); t < periodEnd.getTime(); t += 86400000) {
    const dow = dowOf(new Date(t));
    availableNightsByDow.set(dow, (availableNightsByDow.get(dow) ?? 0) + unitCount);
  }

  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const checkInDow = dowOf(new Date(b.date));
    bookingsByDow.set(checkInDow, (bookingsByDow.get(checkInDow) ?? 0) + 1);
    revenueByDow.set(checkInDow, (revenueByDow.get(checkInDow) ?? 0) + collectedAmountPesos(b) * 100);

    const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
    const s = Math.max(start.getTime(), periodStart.getTime());
    const e = Math.min(end.getTime(), periodEnd.getTime());
    for (let t = s; t < e; t += 86400000) {
      const nightDow = dowOf(new Date(t));
      occupiedNightsByDow.get(nightDow)!.add(`${b.unitId}|${new Date(t).toISOString().slice(0, 10)}`);
    }
  }

  const weeksInWindow = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / 86400000 / 7);
  const rows: WeekdayRow[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const bookingsCount = bookingsByDow.get(dow) ?? 0;
    const revenueCentavos = revenueByDow.get(dow) ?? 0;
    const occupiedNights = occupiedNightsByDow.get(dow)!.size;
    const availableNights = availableNightsByDow.get(dow) ?? 0;
    const occupancyPct = availableNights > 0 ? Math.min(100, Math.round((occupiedNights / availableNights) * 100)) : 0;
    const adrCentavos = bookingsCount > 0 ? Math.round(revenueCentavos / bookingsCount) : 0;
    const revparCentavos = availableNights > 0 ? Math.round(revenueCentavos / availableNights) : 0;
    rows.push({
      dow, label: DOW_LABELS[dow],
      avgBookings: Math.round((bookingsCount / weeksInWindow) * 10) / 10,
      avgRevenueCentavos: Math.round(revenueCentavos / weeksInWindow),
      occupancyPct, adrCentavos, revparCentavos,
      forecastDemandIndex: 0, // filled in below once the overall average is known
    });
  }
  const overallAvgRevenue = rows.reduce((s, r) => s + r.avgRevenueCentavos, 0) / 7;
  for (const r of rows) r.forecastDemandIndex = overallAvgRevenue > 0 ? Math.round((r.avgRevenueCentavos / overallAvgRevenue) * 100) : 100;
  return rows;
}

// ---------------------------------------------------------------------
// Unit forecast — section 7. Extends unitPerformance() (the existing,
// already-correct per-unit actuals) with a forecast column and a trend
// arrow, rather than recomputing occupancy/ADR/RevPAR a second time.
// ---------------------------------------------------------------------

export type UnitForecastRow = UnitPerformanceRow & {
  forecastRevenueCentavos: number;
  trend: "up" | "stable" | "down";
  isBestPerformer: boolean;
  isUnderperformer: boolean;
};

export function forecastByUnit(actual: UnitPerformanceRow[], lastPeriodRevenueCentavosByUnit: Record<string, number>, daysElapsed: number, daysInPeriod: number): UnitForecastRow[] {
  const daysRemaining = Math.max(0, daysInPeriod - daysElapsed);
  const rows: UnitForecastRow[] = actual.map((u) => {
    const dailyPace = daysElapsed > 0 ? u.revenueCentavos / daysElapsed : 0;
    const forecastRevenueCentavos = u.revenueCentavos + Math.round(dailyPace * daysRemaining);
    const lastPeriod = lastPeriodRevenueCentavosByUnit[u.unitId] ?? null;
    let trend: "up" | "stable" | "down" = "stable";
    if (lastPeriod !== null && lastPeriod > 0) {
      const changePct = ((forecastRevenueCentavos - lastPeriod) / lastPeriod) * 100;
      trend = changePct > 5 ? "up" : changePct < -5 ? "down" : "stable";
    }
    return { ...u, forecastRevenueCentavos, trend, isBestPerformer: false, isUnderperformer: false };
  });
  if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => b.forecastRevenueCentavos - a.forecastRevenueCentavos);
    sorted[0].isBestPerformer = sorted[0].forecastRevenueCentavos > 0;
    sorted[sorted.length - 1].isUnderperformer = sorted.length > 1 && sorted[sorted.length - 1].forecastRevenueCentavos < sorted[0].forecastRevenueCentavos;
  }
  return rows;
}

// ---------------------------------------------------------------------
// Booker forecast — section 8. "Revenue/profit generated per booker" has
// no existing Analytics function (staffPerformance.ts is payroll-earnings,
// a genuinely different concept — see the module this was scoped against).
// Built directly on the same finance.ts primitives everything else here
// uses. No per-booker TARGET exists anywhere in this app's config (only a
// per-unit monthly target) — "status" is therefore computed against the
// booker's OWN historical pace, never a fabricated per-person quota.
// ---------------------------------------------------------------------

export type BookerForecastRow = {
  employeeId: string;
  name: string;
  currentBookings: number;
  revenueCentavos: number;
  netProfitCentavos: number; // revenue is treated as the booker's "profit generated" proxy (no cost is attributable to an individual booker) — see profit field note below
  forecastBookings: number;
  forecastRevenueCentavos: number;
  forecastNetProfitCentavos: number;
  status: "ahead" | "on_pace" | "at_risk" | "behind";
};

export function forecastByBooker(
  bookers: { employeeId: string; name: string }[],
  bookings: ForecastBooking[],
  lastPeriodRevenueCentavosByBooker: Record<string, number>,
  daysElapsed: number,
  daysInPeriod: number
): BookerForecastRow[] {
  const daysRemaining = Math.max(0, daysInPeriod - daysElapsed);
  return bookers.map((booker) => {
    const own = bookings.filter((b) => b.bookerId === booker.employeeId && !b.cancelledAt);
    const currentBookings = own.length;
    const revenueCentavos = Math.round(own.reduce((s, b) => s + collectedAmountPesos(b), 0) * 100);
    // "Net profit generated" per booker has no real attributable cost
    // (expenses aren't tracked per-booker anywhere in this app — same
    // conclusion the Sales Championship campaign engine reached for the
    // same reason) — the figure shown IS the real collected revenue, not
    // a fabricated cost deduction.
    const netProfitCentavosValue = revenueCentavos;
    const dailyPace = daysElapsed > 0 ? revenueCentavos / daysElapsed : 0;
    const bookingDailyPace = daysElapsed > 0 ? currentBookings / daysElapsed : 0;
    const forecastRevenueCentavos = revenueCentavos + Math.round(dailyPace * daysRemaining);
    const forecastBookings = Math.round(currentBookings + bookingDailyPace * daysRemaining);
    const lastPeriod = lastPeriodRevenueCentavosByBooker[booker.employeeId] ?? null;
    let status: BookerForecastRow["status"] = "on_pace";
    if (lastPeriod !== null && lastPeriod > 0) {
      const ratio = forecastRevenueCentavos / lastPeriod;
      status = ratio >= 1.1 ? "ahead" : ratio >= 0.9 ? "on_pace" : ratio >= 0.6 ? "at_risk" : "behind";
    } else if (currentBookings === 0) {
      status = "behind";
    }
    return {
      employeeId: booker.employeeId, name: booker.name, currentBookings, revenueCentavos, netProfitCentavos: netProfitCentavosValue,
      forecastBookings, forecastRevenueCentavos, forecastNetProfitCentavos: forecastRevenueCentavos, status,
    };
  }).sort((a, b) => b.forecastRevenueCentavos - a.forecastRevenueCentavos);
}

// ---------------------------------------------------------------------
// Booking source forecast — section 9. Deliberately gross-only, no
// "Platform Fees"/"Net Profit by source" columns — this app has no real
// per-booking platform-fee data for any source (confirmed: the only fee
// record anywhere is an Airbnb-only monthly PDF-import reconciliation
// table, unlinked to individual bookings), and fabricating a fee/net-
// profit figure with nothing real behind it would be exactly the kind of
// invented precision this whole module exists to avoid.
// ---------------------------------------------------------------------

export type SourceForecastRow = {
  source: string;
  bookings: number;
  revenueCentavos: number;
  forecastRevenueCentavos: number;
  growthPct: number | null;
};

export function forecastBySource(bookings: DimensionBooking[], lastPeriodRevenueCentavosBySource: Record<string, number>, daysElapsed: number, daysInPeriod: number): SourceForecastRow[] {
  const rows = revenueByDimension(bookings, "source");
  const daysRemaining = Math.max(0, daysInPeriod - daysElapsed);
  return rows.map((r) => {
    const dailyPace = daysElapsed > 0 ? r.collectedCentavos / daysElapsed : 0;
    const forecastRevenueCentavos = r.collectedCentavos + Math.round(dailyPace * daysRemaining);
    const lastPeriod = lastPeriodRevenueCentavosBySource[r.key] ?? null;
    const growthPct = lastPeriod && lastPeriod > 0 ? Math.round(((forecastRevenueCentavos - lastPeriod) / lastPeriod) * 100) : null;
    return { source: r.label, bookings: r.count, revenueCentavos: r.collectedCentavos, forecastRevenueCentavos, growthPct };
  });
}

// ---------------------------------------------------------------------
// Forecast Insights — section 15. Deterministic, template-based, NOT an
// LLM call — same reasoning analyticsInsight.ts/revenueGoals.ts's
// generateGoalInsight already documents (this app's Gemini key has a hard
// 20-requests/day cap shared across guest AI Concierge + two existing
// Analytics AI Insights panels; these are formulaic sentences with no
// real ambiguity to reason through). Every number is real, pulled from
// the actual computed inputs — never a hardcoded template with fake
// numbers.
// ---------------------------------------------------------------------

export type ForecastInsight = { icon: string; title: string; detail: string };

export function generateForecastInsights(params: {
  summary: MonthlyForecastSummary;
  weekdayRows: WeekdayRow[];
  unitRows: UnitForecastRow[];
  bookerRows: BookerForecastRow[];
}): ForecastInsight[] {
  const { summary, weekdayRows, unitRows, bookerRows } = params;
  const insights: ForecastInsight[] = [];

  if (summary.pace.revenuePacePct !== null) {
    if (summary.pace.revenuePacePct >= 105) {
      insights.push({ icon: "🚀", title: "Revenue is ahead of pace", detail: `Current revenue is ${summary.pace.revenuePacePct - 100}% above the historical expected pace for this point in the month.` });
    } else if (summary.pace.revenuePacePct <= 95) {
      insights.push({ icon: "📉", title: "Revenue is behind pace", detail: `Current revenue is ${100 - summary.pace.revenuePacePct}% below the historical expected pace for this point in the month.` });
    }
  }

  const weekend = weekdayRows.filter((r) => r.dow === 0 || r.dow === 6);
  const weekday = weekdayRows.filter((r) => r.dow >= 1 && r.dow <= 5);
  if (weekend.length > 0 && weekday.length > 0) {
    const weekendAvg = weekend.reduce((s, r) => s + r.avgRevenueCentavos, 0) / weekend.length;
    const weekdayAvg = weekday.reduce((s, r) => s + r.avgRevenueCentavos, 0) / weekday.length;
    if (weekdayAvg > 0) {
      const diffPct = Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100);
      if (Math.abs(diffPct) >= 10) {
        insights.push(
          diffPct > 0
            ? { icon: "🔥", title: "Weekend demand is strong", detail: `Weekend revenue is ${diffPct}% higher than the weekday average.` }
            : { icon: "📆", title: "Weekday demand is stronger than weekends", detail: `Weekday revenue is ${Math.abs(diffPct)}% higher than the weekend average.` }
        );
      }
    }
  }

  if (summary.targetAchievementPct < 100 && summary.remainingPesos > 0) {
    const projectedShortfall = Math.max(0, summary.targetPesos - summary.projectedRevenueCentavos / 100);
    if (projectedShortfall > 0) {
      insights.push({ icon: "⚠️", title: "Target risk", detail: `Current booking velocity may result in a month-end shortfall of approximately ₱${Math.round(projectedShortfall).toLocaleString("en-PH")} against the ₱${summary.targetPesos.toLocaleString("en-PH")} target.` });
    }
  }

  const worstUnit = unitRows.find((u) => u.isUnderperformer);
  if (worstUnit) {
    insights.push({ icon: "🏠", title: "Unit opportunity", detail: `${worstUnit.name} has the lowest projected revenue this period (${worstUnit.occupancyPct}% occupancy) and may benefit from additional promotion.` });
  }

  const strugglingBooker = bookerRows.find((b) => b.status === "behind" || b.status === "at_risk");
  if (strugglingBooker) {
    insights.push({ icon: "🎯", title: "Booker opportunity", detail: `${strugglingBooker.name} is currently ${strugglingBooker.status === "behind" ? "behind" : "at risk of missing"} their historical pace and may need additional lead generation.` });
  }

  if (summary.confidence.band === "insufficient" || summary.confidence.band === "low") {
    insights.push({ icon: "📊", title: "Forecast confidence is limited", detail: `This forecast is based on limited historical data (${summary.confidence.label.toLowerCase()}) — treat projections as directional, not precise.` });
  }

  return insights.slice(0, 5);
}
