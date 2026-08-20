"use client";

import dynamic from "next/dynamic";
import { peso, pesoCentavos, formatUnitDisplay } from "@/lib/format";
import type { ForecastAnalytics } from "@/app/analytics/queries";

const ForecastTrendChart = dynamic(() => import("@/components/analytics/charts/ForecastTrendChart").then((m) => m.ForecastTrendChart), { ssr: false, loading: () => <ChartSkeleton height={240} /> });

function ChartSkeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-xl bg-[var(--bg-2)]" style={{ height }} />;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function paceLabel(pct: number | null): { text: string; cls: string } {
  if (pct === null) return { text: "No baseline", cls: "text-[var(--gray)]" };
  if (pct >= 105) return { text: `${pct}% — ahead of pace`, cls: "text-teal" };
  if (pct <= 95) return { text: `${pct}% — behind pace`, cls: "text-rausch" };
  return { text: `${pct}% — on pace`, cls: "text-[var(--ink)]" };
}

// A real semantic 4-step ramp (good -> neutral -> warning -> bad), not the
// app's own skin-primary brand color — this app's default skin happens to
// set --skin-primary to the same pink as --rausch (the "bad" color), which
// would make "On Pace" and "Behind" render visually identical if On Pace
// used skin-primary. Neutral status must stay a real neutral.
const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ahead: { label: "Ahead", cls: "bg-teal/10 text-teal" },
  on_pace: { label: "On Pace", cls: "bg-[var(--bg-2)] text-[var(--ink)]" },
  at_risk: { label: "At Risk", cls: "bg-amber/10 text-amber" },
  behind: { label: "Behind", cls: "bg-rausch/10 text-rausch" },
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-teal/10 text-teal",
  medium: "bg-amber/10 text-amber",
  low: "bg-rausch/10 text-rausch",
  insufficient: "bg-[var(--bg-2)] text-[var(--gray)]",
};

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className="mt-1 text-[19px] font-extrabold tracking-tight text-[var(--ink)]">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] font-semibold text-[var(--gray)]">{sub}</div>}
    </div>
  );
}

function TrendArrow({ trend }: { trend: "up" | "stable" | "down" }) {
  if (trend === "up") return <span className="text-teal">↑ Trending up</span>;
  if (trend === "down") return <span className="text-rausch">↓ Trending down</span>;
  return <span className="text-[var(--gray)]">→ Stable</span>;
}

export function ForecastSectionClient({ data }: { data: ForecastAnalytics }) {
  const { summary, weekdayRows, unitRows, bookerRows, sourceRows, insights, historicalComparison, revenueMetrics, bookingForecast } = data;
  const confidenceCls = CONFIDENCE_STYLE[summary.confidence.band] ?? CONFIDENCE_STYLE.insufficient;

  const weekend = weekdayRows.filter((r) => r.dow === 0 || r.dow === 6);
  const weekday = weekdayRows.filter((r) => r.dow >= 1 && r.dow <= 5);
  const weekendOcc = weekend.length > 0 ? Math.round(weekend.reduce((s, r) => s + r.occupancyPct, 0) / weekend.length) : 0;
  const weekdayOcc = weekday.length > 0 ? Math.round(weekday.reduce((s, r) => s + r.occupancyPct, 0) / weekday.length) : 0;

  const trendData = [{
    label: "This month",
    actualPesos: Math.round(summary.actualRevenueCentavos / 100),
    confirmedPesos: Math.round(summary.confirmedFutureRevenueCentavos / 100),
    forecastPesos: Math.round(summary.forecastAdditionalRevenueCentavos / 100),
  }];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[16px] font-extrabold tracking-tight">Forecast &amp; Predictive Analytics</h3>
          <p className="text-[12.5px] text-[var(--gray)]">Actual + Confirmed + predicted remaining-days pace for the current month, filtered to match every selection above.</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold ${confidenceCls}`}>{summary.confidence.label}</span>
      </div>

      {/* Section 1 — Forecast Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="stat-card"><StatBlock label="Actual Revenue" value={pesoCentavos(summary.actualRevenueCentavos)} sub="Realized so far" /></div>
        <div className="stat-card"><StatBlock label="Confirmed Revenue" value={pesoCentavos(summary.confirmedFutureRevenueCentavos)} sub="Booked, future check-in" /></div>
        <div className="stat-card"><StatBlock label="Forecast Revenue" value={pesoCentavos(summary.forecastAdditionalRevenueCentavos)} sub="Predicted additional" /></div>
        <div className="stat-card"><StatBlock label="Projected Revenue" value={pesoCentavos(summary.projectedRevenueCentavos)} sub="Actual + Confirmed + Forecast" /></div>
        <div className="stat-card"><StatBlock label="Projected Net Profit" value={pesoCentavos(summary.projectedNetProfitCentavos)} sub="At realized margin rate" /></div>
        <div className="stat-card"><StatBlock label="Projected Occupancy" value={`${summary.projectedOccupancyPct}%`} sub="Month-end estimate" /></div>
        <div className="stat-card"><StatBlock label="Target Achievement" value={`${summary.targetAchievementPct}%`} sub={`of ${peso(summary.targetPesos)} target`} /></div>
        <div className="stat-card">
          <StatBlock
            label="Target Probability"
            value={summary.targetProbabilityPct !== null ? `${summary.targetProbabilityPct}%` : "—"}
            sub={summary.targetProbabilityPct !== null ? "Chance of hitting target" : "Not enough history yet"}
          />
        </div>
      </div>

      {/* Section 2 — Current Pace vs Forecast */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Current Pace vs Historical</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Revenue Pace", summary.pace.revenuePacePct],
            ["Booking Pace", summary.pace.bookingPacePct],
            ["Occupancy Pace", summary.pace.occupancyPacePct],
            ["Profit Pace", summary.pace.profitPacePct],
          ] as const).map(([label, pct]) => {
            const p = paceLabel(pct);
            return (
              <div key={label}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
                <div className={`mt-1 text-[15px] font-extrabold ${p.cls}`}>{p.text}</div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--gray)]">
          Day {summary.pace.daysElapsed} of {summary.pace.daysElapsed + summary.pace.daysRemaining} this month · {summary.pace.remainingAvailableNights} available room-nights remaining ·{" "}
          {summary.pace.historicalExpectedAtSamePointPesos !== null ? `historically ${peso(summary.pace.historicalExpectedAtSamePointPesos)} expected by this point` : "no historical baseline yet"}
        </p>
      </div>

      {/* Section 3 + 14 — Month-End Forecast scenarios + trend chart */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Month-End Forecast</h4>
        <ForecastTrendChart data={trendData} targetPesos={summary.targetPesos} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ScenarioCard label="Conservative" desc="Actual + Confirmed only" s={summary.scenarios.conservative} />
          <ScenarioCard label="Expected" desc="Blended forecast" s={summary.scenarios.expected} highlight />
          <ScenarioCard label="Optimistic" desc="Best-observed pace" s={summary.scenarios.optimistic} />
        </div>
      </div>

      {/* Section 4 — Booking Forecast */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Booking Forecast</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBlock label="Actual Bookings" value={String(bookingForecast.actualBookings)} sub="Elapsed, this month" />
          <StatBlock label="Confirmed Bookings" value={String(bookingForecast.confirmedBookings)} sub="Future check-in, booked" />
          <StatBlock label="Forecast Additional" value={String(bookingForecast.forecastAdditionalBookings)} sub="Predicted, remaining days" />
          <StatBlock label="Projected Total" value={String(bookingForecast.projectedTotalBookings)} sub="Month-end estimate" />
        </div>
      </div>

      {/* Section 5 — Occupancy Forecast */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Occupancy Forecast</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBlock label="Projected Occupancy" value={`${summary.projectedOccupancyPct}%`} sub="Month-end estimate" />
          <StatBlock label="Weekend Avg" value={`${weekendOcc}%`} sub="Sat + Sun, this period" />
          <StatBlock label="Weekday Avg" value={`${weekdayOcc}%`} sub="Mon–Fri, this period" />
          <StatBlock label="Available Nights Left" value={String(summary.pace.remainingAvailableNights)} sub="Rest of month" />
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--gray)]">Per-unit and per-weekday breakdowns are in the Unit Forecast and Weekday/Weekend Forecast tables below.</p>
      </div>

      {/* Section 6 — Revenue Metrics: Actual | Historical Average | Forecast */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Revenue Metrics — Actual vs Historical Average vs Forecast</h4>
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Metric</th>
              <th className="px-3 py-1.5">Actual</th>
              <th className="px-3 py-1.5">Historical Avg</th>
              <th className="px-3 py-1.5">Forecast</th>
            </tr>
          </thead>
          <tbody>
            {([
              ["ADR", revenueMetrics.adrPesos],
              ["RevPAR", revenueMetrics.revparPesos],
            ] as const).map(([label, m]) => (
              <tr key={label} className="border-b border-[var(--line)] last:border-0">
                <td className="py-1.5 pr-3 font-bold">{label}</td>
                <td className="px-3 py-1.5">{peso(m.actual)}</td>
                <td className="px-3 py-1.5 text-[var(--gray)]">{peso(m.historicalAvg)}</td>
                <td className="px-3 py-1.5 font-bold text-[var(--skin-primary,#6C5CE7)]">{peso(m.forecast)}</td>
              </tr>
            ))}
            <tr className="border-b border-[var(--line)] last:border-0">
              <td className="py-1.5 pr-3 font-bold">Revenue / Unit</td>
              <td className="px-3 py-1.5">{peso(revenueMetrics.revenuePerUnitPesos.actual)}</td>
              <td className="px-3 py-1.5 text-[var(--gray)]">—</td>
              <td className="px-3 py-1.5 font-bold text-[var(--skin-primary,#6C5CE7)]">{peso(revenueMetrics.revenuePerUnitPesos.forecast)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 font-bold">Revenue / Booking</td>
              <td className="px-3 py-1.5">{peso(revenueMetrics.revenuePerBookingPesos.actual)}</td>
              <td className="px-3 py-1.5 text-[var(--gray)]">—</td>
              <td className="px-3 py-1.5 font-bold text-[var(--skin-primary,#6C5CE7)]">{peso(revenueMetrics.revenuePerBookingPesos.forecast)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section 7 — Unit Forecast */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Unit Forecast</h4>
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Unit</th>
              <th className="px-3 py-1.5">Actual Revenue</th>
              <th className="px-3 py-1.5">Forecast Revenue</th>
              <th className="px-3 py-1.5">Occupancy</th>
              <th className="px-3 py-1.5">Trend</th>
              <th className="px-3 py-1.5">Flag</th>
            </tr>
          </thead>
          <tbody>
            {unitRows.map((u) => (
              <tr key={u.unitId} className="border-b border-[var(--line)] last:border-0">
                <td className="py-1.5 pr-3 font-bold">{formatUnitDisplay(u.unitNumber, u.name)}</td>
                <td className="px-3 py-1.5">{pesoCentavos(u.revenueCentavos)}</td>
                <td className="px-3 py-1.5 font-bold">{pesoCentavos(u.forecastRevenueCentavos)}</td>
                <td className="px-3 py-1.5">{u.occupancyPct}%</td>
                <td className="px-3 py-1.5"><TrendArrow trend={u.trend} /></td>
                <td className="px-3 py-1.5">
                  {u.isBestPerformer && <span className="mr-1 rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-extrabold text-teal">🟢 Best</span>}
                  {u.isUnderperformer && <span className="rounded-full bg-rausch/10 px-2 py-0.5 text-[11px] font-extrabold text-rausch">🔴 Underperformer</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 8 — Booker Performance Forecast */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Booker Performance Forecast</h4>
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Booker</th>
              <th className="px-3 py-1.5">Bookings</th>
              <th className="px-3 py-1.5">Revenue</th>
              <th className="px-3 py-1.5">Forecast Revenue</th>
              <th className="px-3 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookerRows.map((b) => {
              const s = STATUS_STYLE[b.status] ?? STATUS_STYLE.on_pace;
              return (
                <tr key={b.employeeId} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-1.5 pr-3 font-bold">{b.name}</td>
                  <td className="px-3 py-1.5">{b.currentBookings}</td>
                  <td className="px-3 py-1.5">{pesoCentavos(b.revenueCentavos)}</td>
                  <td className="px-3 py-1.5 font-bold">{pesoCentavos(b.forecastRevenueCentavos)}</td>
                  <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${s.cls}`}>{s.label}</span></td>
                </tr>
              );
            })}
            {bookerRows.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-[var(--gray)]">No active bookers.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Section 9 — Booking Source Forecast (gross only — no fabricated platform fees) */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Booking Source Forecast</h4>
        <p className="mb-2 text-[11.5px] text-[var(--gray)]">Gross revenue only — this app has no real per-booking platform-fee data to compute net profit by source.</p>
        <table className="w-full min-w-[520px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Source</th>
              <th className="px-3 py-1.5">Bookings</th>
              <th className="px-3 py-1.5">Revenue</th>
              <th className="px-3 py-1.5">Forecast Revenue</th>
              <th className="px-3 py-1.5">Growth</th>
            </tr>
          </thead>
          <tbody>
            {sourceRows.map((s) => (
              <tr key={s.source} className="border-b border-[var(--line)] last:border-0">
                <td className="py-1.5 pr-3 font-bold">{s.source}</td>
                <td className="px-3 py-1.5">{s.bookings}</td>
                <td className="px-3 py-1.5">{pesoCentavos(s.revenueCentavos)}</td>
                <td className="px-3 py-1.5 font-bold">{pesoCentavos(s.forecastRevenueCentavos)}</td>
                <td className="px-3 py-1.5">
                  {s.growthPct === null ? <span className="text-[var(--gray)]">—</span> : <span className={s.growthPct >= 0 ? "text-teal" : "text-rausch"}>{s.growthPct >= 0 ? "↑" : "↓"} {Math.abs(s.growthPct)}%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 10 — Weekday/Weekend Forecast matrix */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Weekday / Weekend Forecast</h4>
        <table className="w-full min-w-[600px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Day</th>
              <th className="px-3 py-1.5">Avg Bookings</th>
              <th className="px-3 py-1.5">Avg Revenue</th>
              <th className="px-3 py-1.5">Occupancy</th>
              <th className="px-3 py-1.5">ADR</th>
              <th className="px-3 py-1.5">Demand Index</th>
            </tr>
          </thead>
          <tbody>
            {weekdayRows.map((r) => (
              <tr key={r.dow} className={`border-b border-[var(--line)] last:border-0 ${r.dow === 0 || r.dow === 6 ? "bg-[var(--bg-2)]/50" : ""}`}>
                <td className="py-1.5 pr-3 font-bold">{DOW_SHORT[r.dow]}</td>
                <td className="px-3 py-1.5">{r.avgBookings}</td>
                <td className="px-3 py-1.5">{pesoCentavos(r.avgRevenueCentavos)}</td>
                <td className="px-3 py-1.5">{r.occupancyPct}%</td>
                <td className="px-3 py-1.5">{pesoCentavos(r.adrCentavos)}</td>
                <td className="px-3 py-1.5">
                  <span className={r.forecastDemandIndex >= 110 ? "font-bold text-teal" : r.forecastDemandIndex <= 90 ? "font-bold text-rausch" : ""}>{r.forecastDemandIndex}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 13 — Historical Comparison */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Historical Comparison</h4>
        <p className="mb-2 text-[11.5px] text-[var(--gray)]">{historicalComparison.label}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([
            ["Revenue", historicalComparison.revenueGrowthPct],
            ["Bookings", historicalComparison.bookingsGrowthPct],
            ["Occupancy", historicalComparison.occupancyGrowthPct],
            ["ADR", historicalComparison.adrGrowthPct],
            ["Net Profit", historicalComparison.netProfitGrowthPct],
          ] as const).map(([label, pct]) => (
            <div key={label}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
              <div className={`mt-1 text-[15px] font-extrabold ${pct === null ? "text-[var(--gray)]" : pct >= 0 ? "text-teal" : "text-rausch"}`}>
                {pct === null ? "No prior data" : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}%`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 12 — Forecast Confidence breakdown */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Forecast Confidence</h4>
        <div className="mb-3 flex items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-[13px] font-extrabold ${confidenceCls}`}>{summary.confidence.label}</span>
        </div>
        {summary.confidence.factors.length > 0 && (
          <div className="space-y-2">
            {summary.confidence.factors.map((f) => (
              <div key={f.label} className="flex items-center gap-2">
                <span className="w-40 flex-none truncate text-[11.5px] font-semibold text-[var(--gray)]">{f.label}</span>
                <div className="h-1.5 flex-1 rounded-full bg-[var(--bg-2)]">
                  <div className="h-1.5 rounded-full bg-[var(--skin-primary,#6C5CE7)]" style={{ width: `${Math.round(f.score)}%` }} />
                </div>
                <span className="w-10 flex-none text-right text-[11.5px] font-bold">{Math.round(f.score)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 15 — AI/Automated Insights (deterministic) */}
      {insights.length > 0 && (
        <div className="card p-4">
          <h4 className="mb-3 text-[13.5px] font-extrabold">Forecast Insights</h4>
          <div className="space-y-2.5">
            {insights.map((ins, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="text-[16px] leading-none">{ins.icon}</span>
                <div>
                  <div className="text-[12.5px] font-bold">{ins.title}</div>
                  <div className="text-[12px] text-[var(--gray)]">{ins.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ label, desc, s, highlight }: { label: string; desc: string; s: { revenueCentavos: number; occupancyPct: number; netProfitCentavos: number }; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-[var(--skin-primary,#6C5CE7)]/40 bg-[var(--skin-primary,#6C5CE7)]/5" : "border-[var(--line)]"}`}>
      <div className="text-[11.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className="text-[10.5px] text-[var(--gray)]">{desc}</div>
      <div className="mt-2 text-[18px] font-extrabold tracking-tight">{pesoCentavos(s.revenueCentavos)}</div>
      <div className="mt-1 text-[11.5px] font-semibold text-[var(--gray)]">{s.occupancyPct}% occupancy · {pesoCentavos(s.netProfitCentavos)} profit</div>
    </div>
  );
}
