import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { peso } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { useKeyMetricsInsight } from "../hooks/useKeyMetricsInsight";
import type { KeyMetricsComparison } from "../hooks/useKeyMetricsComparison";
import type { Booking } from "../types";

type OccupancyByStayType = Record<"Daycation" | "Night" | "Full", { bookings: number; nights: number }>;

/** "↑ 12% vs Jul 1–8" / "↓ 8% vs Jul 1–8" — neutral arrows, never red text,
 * for a routine period-over-period comparison. `null` (no baseline to
 * compare against) renders nothing rather than a fake 0%. */
function pctDeltaLine(pct: number | null, against: string): string | null {
  if (pct === null) return null;
  if (pct === 0) return `Flat vs ${against}`;
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${against}`;
}

/** Same as pctDeltaLine but in percentage points — for comparing two
 * already-percent figures (occupancy, margin) where a plain "%" would be
 * ambiguous (is a move from 30% to 35% "+5%" or "+16.7%"?). */
function ptsDeltaLine(pts: number, against: string): string {
  if (pts === 0) return `Flat vs ${against}`;
  return `${pts > 0 ? "↑" : "↓"} ${Math.abs(pts)} pt${Math.abs(pts) === 1 ? "" : "s"} vs ${against}`;
}

export function KeyMetricsSection({
  netProfit,
  netProfitRaw,
  margin,
  marginRaw,
  cashFlow,
  cashFlowRaw,
  // Read-only derived slice of the Earnings period filter — this card never
  // mutates the filter, so it never receives the setters.
  filteredOccupancy,
  occupancyByStayType,
  filteredRevpar,
  filteredAdr,
  filteredUnitCount,
  periodPhrase,
  // useKeyMetricsInsight inputs.
  overdueCentavos,
  billsDueMonthCentavos,
  billsPaidMonthCentavos,
  monthlyStaffSalary,
  completedMonthIncome,
  forecastProfitCents,
  monthIncome,
  bookingsMonth,
  comparison,
  occupancyComparisonValid,
}: {
  netProfit: number;
  netProfitRaw: number;
  margin: number;
  marginRaw: number;
  cashFlow: number;
  cashFlowRaw: number;
  filteredOccupancy: number;
  occupancyByStayType: OccupancyByStayType;
  filteredRevpar: number;
  filteredAdr: number;
  filteredUnitCount: number;
  periodPhrase: string;
  periodPhraseCap: string;
  overdueCentavos: number;
  billsDueMonthCentavos: number;
  billsPaidMonthCentavos: number;
  monthlyStaffSalary: number;
  completedMonthIncome: number;
  forecastProfitCents: number;
  monthIncome: number;
  bookingsMonth: Booking[];
  /** Date-aware vs-last-month / vs-3-month-benchmark figures, plus a
   * pace-blended month-end forecast — see useKeyMetricsComparison. */
  comparison: KeyMetricsComparison;
  /** False whenever the Earnings period filter isn't at its default
   * current-month state — Occupancy/RevPAR/ADR follow that filter, but
   * `comparison` is always computed for the current month-to-date, so
   * their "vs Jul 1–8" lines are only valid to show when both agree on
   * what period "current" means. */
  occupancyComparisonValid: boolean;
}) {
  const { keyMetricsInsights, aiInsight, generateInsight, loadingInsight, insightError } = useKeyMetricsInsight({
    overdueCentavos,
    billsDueMonthCentavos,
    billsPaidMonthCentavos,
    monthlyStaffSalary,
    completedMonthIncome,
    netProfit,
    forecastProfitCents,
    monthIncome,
    bookingsMonth,
    occupancy: filteredOccupancy,
    occupancyByStayType,
    comparison,
    unitCount: filteredUnitCount,
  });

  const { comparison: cmp, lastMonth, benchmarkAvg, forecast } = comparison;
  const benchmarkLabel = "3-mo benchmark";
  const lastMonthLabel = lastMonth.shortLabel;

  // Break-even opportunity — same real figure the old paragraph led with
  // ("₱X more revenue is needed..."), demoted to a small secondary caption
  // under Projected Month-End instead of a standalone alarming headline.
  const operatingCostCentavos = monthlyStaffSalary * 100 + billsPaidMonthCentavos + billsDueMonthCentavos;
  const breakEvenRemainingCentavos = Math.max(0, operatingCostCentavos - completedMonthIncome * 100);

  return (
    <Accordion title="Key metrics">
      {/* Section 11 — a plain label, not an interactive selector: the app
          already knows today's date, so there's nothing for the owner to
          pick. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]">
        <span className="font-extrabold text-[var(--ink)]">{comparison.current.label}</span>
        <span className="text-[var(--gray)]">vs {lastMonth.label} · {benchmarkLabel}: {comparison.benchmarkMonths[2].shortLabel.split(" ")[0]}–{comparison.benchmarkMonths[0].shortLabel.split(" ")[0]}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {/* Red is reserved for things that actually need action (overdue
            bills, low stock, open findings — see "Needs your attention"
            below). A dip in a routine metric like these gets amber, a
            softer "worth a look," not an alarm. Occupancy/RevPAR/ADR
            can't mathematically go negative, so they never get either. */}
        <StatCard
          icon="wallet"
          label="Profit to date" value={peso(netProfit)}
          sub={
            <>
              <div>completed stays</div>
              {pctDeltaLine(cmp.profitVsLastMonthPct, lastMonthLabel) && (
                <div className={cmp.profitVsLastMonthPct! >= 0 ? "mt-1 font-bold text-teal" : "mt-1 font-bold text-amber"}>{pctDeltaLine(cmp.profitVsLastMonthPct, lastMonthLabel)}</div>
              )}
              <div className="mt-0.5 text-[var(--gray)]">{benchmarkLabel}: {peso(Math.round(benchmarkAvg.profitCentavos / 100))}</div>
            </>
          }
          warn={netProfitRaw < 0} tone="caution"
          info="Completed-stay revenue minus paid bills, expenses, and payroll accrued so far. Floors at ₱0."
        />
        <StatCard
          icon="trending-up"
          label="Projected month-end" value={peso(Math.round(forecast.profitCentavos / 100))}
          sub={
            <>
              <div>based on current pace</div>
              {forecast.vsBenchmarkPct !== null && (
                <div className={forecast.vsBenchmarkPct >= 0 ? "mt-1 font-bold text-teal" : "mt-1 font-bold text-amber"}>
                  {forecast.vsBenchmarkPct === 0 ? `In line with ${benchmarkLabel}` : forecast.vsBenchmarkPct > 0 ? `↑ ${forecast.vsBenchmarkPct}% vs ${benchmarkLabel}` : `↓ ${Math.abs(forecast.vsBenchmarkPct)}% vs ${benchmarkLabel}`}
                </div>
              )}
              {breakEvenRemainingCentavos > 0 && (
                <div className="mt-1 text-[var(--gray)]">Break-even opportunity: {peso(Math.round(breakEvenRemainingCentavos / 100))} more needed</div>
              )}
            </>
          }
          projected
          info="Current month-to-date actual, plus the rest of the month projected at the recent 3-month same-period pace — not a simple current-rate extrapolation."
        />
        <StatCard
          icon="percent"
          label="Profit margin" value={`${margin}%`}
          sub={
            <>
              <div>of realized revenue</div>
              <div className={cmp.marginPtsVsLastMonth >= 0 ? "mt-1 font-bold text-teal" : "mt-1 font-bold text-amber"}>{ptsDeltaLine(cmp.marginPtsVsLastMonth, lastMonthLabel)}</div>
            </>
          }
          warn={marginRaw < 0} tone="caution"
          info="Realized profit as a percent of completed-stay revenue. Floors at 0%."
        />
        <StatCard
          icon="banknote"
          label="Cash flow" value={peso(cashFlow)}
          sub={
            <>
              <div>collected − paid costs</div>
              {pctDeltaLine(cmp.cashFlowVsLastMonthPct, lastMonthLabel) && (
                <div className={cmp.cashFlowVsLastMonthPct! >= 0 ? "mt-1 font-bold text-teal" : "mt-1 font-bold text-amber"}>{pctDeltaLine(cmp.cashFlowVsLastMonthPct, lastMonthLabel)}</div>
              )}
            </>
          }
          warn={cashFlowRaw < 0} tone="caution"
          info="Everything collected this month minus paid bills, expenses, and payroll accrued so far. Floors at ₱0."
        />
        <StatCard
          icon="home"
          label="Occupancy" value={`${filteredOccupancy}%`}
          sub={
            <>
              <div>across {filteredUnitCount} unit{filteredUnitCount !== 1 ? "s" : ""}</div>
              {occupancyComparisonValid && (
                <>
                  <div className={cmp.occupancyPtsVsLastMonth >= 0 ? "mt-1 font-bold text-teal" : "mt-1 font-bold text-amber"}>{ptsDeltaLine(cmp.occupancyPtsVsLastMonth, lastMonthLabel)}</div>
                  <div className="mt-0.5 text-[var(--gray)]">{benchmarkLabel}: {Math.round(benchmarkAvg.occupancyPct)}%</div>
                </>
              )}
            </>
          }
          info={`Booked nights ${periodPhrase} ÷ total available nights.`}
        />
        <StatCard
          icon="gauge"
          label="RevPAR" value={peso(filteredRevpar)}
          sub={
            <>
              <div>revenue per available room</div>
              {occupancyComparisonValid && pctDeltaLine(cmp.revparVsLastMonthPct, lastMonthLabel) && <div className={cmp.revparVsLastMonthPct! >= 0 ? "mt-1 font-bold text-teal" : "mt-1 font-bold text-amber"}>{pctDeltaLine(cmp.revparVsLastMonthPct, lastMonthLabel)}</div>}
            </>
          }
          info="This period's income ÷ available room-nights." infoAlign="right"
        />
        <StatCard
          icon="tag"
          label="Nightly rate (ADR)" value={peso(filteredAdr)}
          sub={
            <>
              <div>revenue per occupied night</div>
              {occupancyComparisonValid && pctDeltaLine(cmp.adrVsLastMonthPct, lastMonthLabel) && <div className={cmp.adrVsLastMonthPct! >= 0 ? "mt-1 font-bold text-teal" : "mt-1 font-bold text-amber"}>{pctDeltaLine(cmp.adrVsLastMonthPct, lastMonthLabel)}</div>}
            </>
          }
          info="This period's booked revenue ÷ actual nights stayed." infoAlign="right"
        />
      </div>

      <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12.5px] leading-relaxed text-[var(--gray)]">{aiInsight ?? keyMetricsInsights.join(" ")}</p>
          {/* Gemini call only ever happens on click — see useKeyMetricsInsight
              for why this used to fire automatically on every period-nav
              click and no longer does. */}
          <button
            type="button"
            onClick={generateInsight}
            disabled={loadingInsight}
            title={aiInsight ? "Regenerate this insight" : "Generate an AI-written version of this summary"}
            className="flex-none whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--gray)] transition hover:text-[var(--ink)] disabled:opacity-60"
          >
            {loadingInsight ? "Generating…" : aiInsight ? "✨ Regenerate" : "✨ Generate insight"}
          </button>
        </div>
        {insightError && !loadingInsight && (
          <p className="mt-1.5 text-[11px] font-semibold text-rausch">Couldn&rsquo;t generate an insight right now — please try again.</p>
        )}

        {/* Section 4/17 — three compact, always-real numbers a reader can
            scan without reading the paragraph: how this period is trending,
            where it sits against the recent normal, and the concrete
            opportunity left to act on. */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Performing</div>
            <div className={`mt-0.5 text-[12.5px] font-bold ${cmp.profitVsLastMonthPct === null || cmp.profitVsLastMonthPct >= 0 ? "text-teal" : "text-amber"}`}>
              {pctDeltaLine(cmp.profitVsLastMonthPct, lastMonthLabel) ?? "No prior-period data yet"}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Benchmark</div>
            <div className={`mt-0.5 text-[12.5px] font-bold ${cmp.profitVsBenchmarkPct === null || cmp.profitVsBenchmarkPct >= 0 ? "text-teal" : "text-amber"}`}>
              {pctDeltaLine(cmp.profitVsBenchmarkPct, "3-mo avg") ?? "No benchmark data yet"}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Opportunity</div>
            <div className="mt-0.5 text-[12.5px] font-bold text-[var(--ink)]">{comparison.remainingOpenNights} open room night{comparison.remainingOpenNights === 1 ? "" : "s"} left this month</div>
          </div>
        </div>

        {/* Once the AI paragraph above lands, it already narrates this
            breakdown itself (see nightsByStayType in dashboardInsight.ts) —
            this deterministic line is the fallback for when aiInsight is
            still loading or the Gemini call failed, same "always have a
            solid template" discipline as keyMetricsInsights above. */}
        {!aiInsight && (["Daycation", "Night", "Full"] as const).some((k) => occupancyByStayType[k].nights > 0) && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--gray)]">
            Occupied nights {periodPhrase} by stay type:{" "}
            {(["Daycation", "Night", "Full"] as const).map((k, i) => (
              <span key={k}>
                {i > 0 && ", "}
                <span className="font-bold" style={{ color: STAY_TYPES[k].color }}>{STAY_TYPES[k].label}</span> ({STAY_TYPES[k].hrs}): {occupancyByStayType[k].nights} night{occupancyByStayType[k].nights === 1 ? "" : "s"} / {occupancyByStayType[k].bookings} booking{occupancyByStayType[k].bookings === 1 ? "" : "s"}
              </span>
            ))}
            .
          </p>
        )}
      </div>
    </Accordion>
  );
}
