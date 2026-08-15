import { useEffect, useMemo, useState } from "react";
import { peso, pesoCentavos } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import type { KeyMetricsComparison } from "./useKeyMetricsComparison";
import type { Booking } from "../types";

type OccupancyByStayType = Record<"Daycation" | "Night" | "Full", { bookings: number; nights: number }>;

/**
 * Data-driven narrative for the Key metrics card — kept to 1-2 short,
 * positive-but-honest sentences (a genuinely urgent overdue-bills note can
 * still lead when real) rather than the old always-4-sentence, break-even-
 * focused paragraph, which led with "₱X more revenue is needed..." even in
 * a perfectly normal early-month state. The underlying numbers are
 * unchanged — same real completed revenue, occupancy, overdue bills — only
 * which of them leads and how it's phrased changed, per this app's
 * "contextualize a shortfall, never hide it" rule: a below-benchmark period
 * still says so, just alongside the comparison and the opportunity instead
 * of alone.
 *
 * keyMetricsInsights (returned below) is the instant, always-available
 * fallback — shown by default. aiInsight is a naturally-phrased Gemini
 * summary of the exact same numbers — never a different set of facts, just
 * better prose — generated on demand via generateInsight(), not
 * automatically, so a billed Gemini call only happens when the owner
 * actually asks for one. Fails silently to the fallback on error (never
 * blocks the page). insightMetricsPayload (what's sent to Gemini) is
 * unchanged by this rework — only the deterministic fallback text below is
 * new.
 */
export function useKeyMetricsInsight({
  overdueCentavos,
  billsDueMonthCentavos,
  billsPaidMonthCentavos,
  monthlyStaffSalary,
  completedMonthIncome,
  netProfit,
  forecastProfitCents,
  monthIncome,
  bookingsMonth,
  occupancy,
  occupancyByStayType,
  comparison,
  unitCount,
}: {
  overdueCentavos: number;
  billsDueMonthCentavos: number;
  billsPaidMonthCentavos: number;
  monthlyStaffSalary: number;
  completedMonthIncome: number;
  /** Actual profit (revenue minus paid/accrued costs), floored at ₱0 — same
   * figure the "Profit to date" card shows. The lead sentence must use this,
   * not completedMonthIncome (gross completed-stay revenue before costs) —
   * calling the latter "profit" produced exactly the kind of contradicting
   * numbers section 18 warns against (a screen saying "₱42,269 profit" right
   * next to a card reading "₱22,900"). */
  netProfit: number;
  forecastProfitCents: number;
  monthIncome: number;
  bookingsMonth: Booking[];
  /** Same period-scoped occupancy percentage the Occupancy stat card itself
   * shows (filteredOccupancy from useEarningsData) — this used to compute
   * its own separate always-trailing-7-day figure here, which could (and
   * did) disagree with the displayed card, e.g. "occupancy rate of 69
   * percent" in this prose next to a "78%" card for the same month simply
   * because one was a fixed week window and the other followed the
   * Weekly/Monthly/Yearly period filter. Single source of truth now. */
  occupancy: number;
  /** Same breakdown KeyMetricsSection's "Occupied nights by stay type" line
   * renders deterministically — sent through so the AI insight can fold it
   * into the same narrative instead of the reader getting two disconnected
   * paragraphs (one natural-language, one a raw comma-separated list). */
  occupancyByStayType: OccupancyByStayType;
  /** Date-aware vs-last-month / vs-3-month-benchmark figures (see
   * useKeyMetricsComparison) — the source for the new lead sentence and the
   * Performing/Benchmark/Opportunity chips, replacing the old break-even-
   * only framing. */
  comparison: KeyMetricsComparison;
  /** Same unit count the Occupancy stat card shows ("across N units") — reused here so the lead sentence never disagrees with the card next to it. */
  unitCount: number;
}) {
  const { keyMetricsInsights, insightMetricsPayload } = useMemo(() => {
    const insights: string[] = [];
    const operatingCostCentavos = monthlyStaffSalary * 100 + billsPaidMonthCentavos + billsDueMonthCentavos;
    const futureScheduledCentavos = Math.max(0, billsDueMonthCentavos - overdueCentavos);
    const remainingToBreakEvenCentavos = Math.max(0, operatingCostCentavos - completedMonthIncome * 100);
    const coveragePct = operatingCostCentavos > 0 ? Math.min(100, Math.round((completedMonthIncome * 100 / operatingCostCentavos) * 100)) : 0;
    // Nothing completed yet, but most of this month's costs aren't even due
    // yet either — an empty-looking Realized profit here is just timing,
    // not a loss, so frame it that way rather than as a shortfall.
    const earlyMonth = completedMonthIncome === 0 && futureScheduledCentavos > overdueCentavos;
    const breakEvenStatus: "early_month" | "no_completed_income" | "remaining" | "covered" =
      earlyMonth ? "early_month" : completedMonthIncome === 0 ? "no_completed_income" : remainingToBreakEvenCentavos > 0 ? "remaining" : "covered";

    // 1. Genuinely urgent — an actual overdue payment is worth leading with
    // even in an otherwise-positive summary; this is the one case the
    // "positive but honest" rule explicitly still wants surfaced plainly.
    if (overdueCentavos > 0) {
      insights.push(`${pesoCentavos(overdueCentavos)} of expenses are overdue and need payment.`);
    }

    // 2. Lead sentence — where things actually stand right now, in plain
    // terms. netProfit (not completedMonthIncome) — this must say the same
    // number "Profit to date" shows, not gross revenue before costs.
    insights.push(`You're at ${peso(netProfit)} profit so far this period, with ${occupancy}% occupancy across ${unitCount} unit${unitCount === 1 ? "" : "s"}.`);

    // 3. Comparison-aware follow-up — vs last month first (the more
    // intuitive comparison), contextualized with the real opportunity
    // rather than left as a bare shortfall.
    const vsLastMonth = comparison.comparison.profitVsLastMonthPct;
    const vsBenchmark = comparison.comparison.profitVsBenchmarkPct;
    if (vsLastMonth !== null && vsLastMonth > 0) {
      insights.push(`You're ahead of ${comparison.lastMonth.shortLabel} by ${vsLastMonth}% at this point in the month.`);
    } else if (vsLastMonth !== null && vsLastMonth < 0) {
      insights.push(`You're ${Math.abs(vsLastMonth)}% below ${comparison.lastMonth.shortLabel} at this point, with ${comparison.remainingOpenNights} open room night${comparison.remainingOpenNights === 1 ? "" : "s"} left this month.`);
    } else if (vsBenchmark !== null && vsBenchmark >= 0) {
      insights.push(`Performance is ${vsBenchmark === 0 ? "in line with" : `${vsBenchmark}% above`} the recent 3-month benchmark.`);
    } else if (vsBenchmark !== null) {
      insights.push(`Performance is ${Math.abs(vsBenchmark)}% below the recent benchmark — ${comparison.remainingOpenNights} open room night${comparison.remainingOpenNights === 1 ? "" : "s"} left to close the gap.`);
    }

    const nightsByStayType = (["Daycation", "Night", "Full"] as const)
      .filter((k) => occupancyByStayType[k].nights > 0)
      .map((k) => ({ label: STAY_TYPES[k].label, hrs: STAY_TYPES[k].hrs, nights: occupancyByStayType[k].nights, bookings: occupancyByStayType[k].bookings }));

    return {
      keyMetricsInsights: insights.slice(0, 3),
      insightMetricsPayload: {
        overdueAmount: overdueCentavos > 0 ? pesoCentavos(overdueCentavos) : null,
        breakEvenStatus,
        remainingToBreakEven: breakEvenStatus === "remaining" ? pesoCentavos(remainingToBreakEvenCentavos) : null,
        coveragePct: breakEvenStatus === "covered" ? coveragePct : null,
        bookingsCount: bookingsMonth.length,
        completedRevenue: peso(completedMonthIncome),
        occupancyPct: occupancy,
        cashFlowIsZero: monthIncome === 0,
        forecastIsNegative: forecastProfitCents < 0,
        nightsByStayType: nightsByStayType.length > 0 ? nightsByStayType : undefined,
      },
    };
  }, [overdueCentavos, billsDueMonthCentavos, billsPaidMonthCentavos, monthlyStaffSalary, completedMonthIncome, netProfit, forecastProfitCents, monthIncome, occupancy, bookingsMonth, occupancyByStayType, comparison, unitCount]);

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [insightError, setInsightError] = useState(false);
  const payloadKey = JSON.stringify(insightMetricsPayload);

  // The period filter (or any underlying number) changing invalidates
  // whatever aiInsight is currently shown — it described a different set of
  // metrics — so it's cleared back to the deterministic fallback rather
  // than left on screen looking current. Doesn't itself fetch a new one;
  // that's only ever triggered by the button below.
  useEffect(() => {
    setAiInsight(null);
    setInsightError(false);
  }, [payloadKey]);

  useEffect(() => {
    if (!loadingInsight) return;
    const controller = new AbortController();
    fetch("/api/dashboard/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadKey,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((j) => { if (j?.insight) setAiInsight(j.insight); else setInsightError(true); })
      .catch((e) => { if (e?.name !== "AbortError") setInsightError(true); })
      .finally(() => setLoadingInsight(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingInsight]);

  function generateInsight() {
    setInsightError(false);
    setLoadingInsight(true);
  }

  return { keyMetricsInsights, aiInsight, generateInsight, loadingInsight, insightError };
}
