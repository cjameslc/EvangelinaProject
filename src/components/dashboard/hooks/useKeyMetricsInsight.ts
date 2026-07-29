import { useEffect, useMemo, useState } from "react";
import { peso, pesoCentavos } from "@/lib/format";
import { computeOccupancy, type OccupancyBlock } from "@/lib/analytics/occupancy";
import type { Booking } from "../types";

/**
 * Data-driven narrative for the Key metrics card — 2-4 sentences that
 * actually explain THIS month's numbers, in a fixed priority order
 * (overdue → break-even → bookings → occupancy → cash flow → forecast).
 * "Operating cost" here is the fixed monthly baseline (full staff salary +
 * this month's bills, paid and pending) — deliberately excludes variable ad
 * spend, since that's discretionary, not a fixed cost to break even
 * against.
 *
 * keyMetricsInsights (returned below) is the instant, always-available
 * fallback — rendered immediately and kept if the AI call this hook makes
 * never lands. aiInsight is a naturally-phrased Gemini summary of the exact
 * same numbers — never a different set of facts, just better prose. Fails
 * silently to the fallback (never blocks the page, never shows an error for
 * a non-critical cosmetic upgrade).
 */
export function useKeyMetricsInsight({
  overdueCentavos,
  billsDueMonthCentavos,
  billsPaidMonthCentavos,
  monthlyStaffSalary,
  completedMonthIncome,
  forecastProfitCents,
  monthIncome,
  bookingsMonth,
  units,
  weekRangeStart,
  weekRangeEnd,
  bookingsWeek,
  calendarBlocksOccupancy,
}: {
  overdueCentavos: number;
  billsDueMonthCentavos: number;
  billsPaidMonthCentavos: number;
  monthlyStaffSalary: number;
  completedMonthIncome: number;
  forecastProfitCents: number;
  monthIncome: number;
  bookingsMonth: Booking[];
  units: { id: string }[];
  weekRangeStart: string;
  weekRangeEnd: string;
  bookingsWeek: Booking[];
  calendarBlocksOccupancy: OccupancyBlock[];
}) {
  // Real occupied/available nights from actual date ranges (via
  // src/lib/analytics/occupancy.ts), not a flat booking-count/×7
  // approximation — a 3-night Full stay now correctly counts as 3 occupied
  // nights, and a unit under Maintenance no longer counts as "available".
  // weekRangeStart/End are the exact window the server fetched bookingsWeek
  // for, so this always matches what was actually queried. Only used for
  // its occupancyPct here — see useMonthlyProfitSummary/DashboardView's own
  // comment for why the rest of this same computeOccupancy call's figures
  // (income/revpar/adr/occupiedNights/availableNights) were dead code and
  // dropped rather than migrated.
  const weeklyOccupancy = useMemo(
    () =>
      computeOccupancy({
        unitCount: units.length,
        periodStart: new Date(weekRangeStart),
        periodEnd: new Date(weekRangeEnd),
        bookings: bookingsWeek,
        maintenanceBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Maintenance"),
        cleaningBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Cleaning"),
      }),
    [units.length, weekRangeStart, weekRangeEnd, bookingsWeek, calendarBlocksOccupancy]
  );
  const occupancy = weeklyOccupancy.occupancyPct;

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

    // 1. Critical overdue payments
    if (overdueCentavos > 0) {
      insights.push(`${pesoCentavos(overdueCentavos)} of expenses are overdue and require immediate payment.`);
    }

    // 2. Break-even progress
    let breakEvenStatus: "early_month" | "no_completed_income" | "remaining" | "covered";
    if (earlyMonth) {
      breakEvenStatus = "early_month";
      insights.push("Most monthly operating expenses are scheduled for later this month. Current profit is expected to improve as more bookings are confirmed and completed.");
    } else if (completedMonthIncome === 0) {
      breakEvenStatus = "no_completed_income";
      insights.push("Realized profit is ₱0 because no stays have been completed yet during the selected period.");
    } else if (remainingToBreakEvenCentavos > 0) {
      breakEvenStatus = "remaining";
      insights.push(`${pesoCentavos(remainingToBreakEvenCentavos)} more revenue is needed to reach this month's break-even point.`);
    } else {
      breakEvenStatus = "covered";
      insights.push(`This month's operating costs are already fully covered — revenue is covering ${coveragePct}% of monthly operating costs.`);
    }

    // 3. Booking performance
    if (bookingsMonth.length > 0) {
      insights.push(`${bookingsMonth.length} booking${bookingsMonth.length === 1 ? "" : "s"} recorded this month, generating ${peso(completedMonthIncome)} in completed-stay revenue so far.`);
    }

    // 4. Occupancy trend
    insights.push(
      occupancy >= 70
        ? `Occupancy is ${occupancy}%, indicating strong booking performance.`
        : `Occupancy is ${occupancy}%, with availability remaining for additional bookings.`
    );

    // 5. Cash flow
    if (monthIncome === 0) {
      insights.push("Cash flow remains at ₱0 because guest payments have not yet been received.");
    }

    // 6. Forecast explanation — never frame this as a loss, just timing.
    if (forecastProfitCents < 0) {
      insights.push("Current bookings have not yet covered this month's operating costs. Forecast profit will update automatically as new bookings are added and completed.");
    }

    return {
      keyMetricsInsights: insights.slice(0, 4),
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
      },
    };
  }, [overdueCentavos, billsDueMonthCentavos, billsPaidMonthCentavos, monthlyStaffSalary, completedMonthIncome, forecastProfitCents, monthIncome, occupancy, bookingsMonth]);

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  useEffect(() => {
    setAiInsight(null);
    // A real AbortController, not just a `cancelled` flag — this is a
    // billed Gemini call (see the comment above), and clicking through the
    // period-nav arrows a few times in a row was previously firing a full
    // paid round trip for every intermediate click, only to throw the
    // response away client-side once a newer one landed. Aborting the
    // in-flight request when this effect re-runs (or unmounts) means only
    // the period the user actually settles on ever completes server-side.
    const controller = new AbortController();
    fetch("/api/dashboard/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(insightMetricsPayload),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => { if (j?.insight) setAiInsight(j.insight); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(insightMetricsPayload)]);

  return { keyMetricsInsights, aiInsight };
}
