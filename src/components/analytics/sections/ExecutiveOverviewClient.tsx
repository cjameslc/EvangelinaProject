"use client";

import { useMemo, useState } from "react";
import { peso, pesoCentavos, formatUnitDisplay } from "@/lib/format";
import { Drawer } from "@/components/ui/Drawer";
import { WhatIfSimulator } from "@/components/analytics/WhatIfSimulator";
import type { ProfitabilityAnalytics } from "@/app/analytics/queries";
import type { ForecastAnalytics } from "@/app/analytics/queries";

type Verdict = ProfitabilityAnalytics["healthVerdict"];
type UnitRow = ProfitabilityAnalytics["unitEconomics"][number];
type BookerRow = ProfitabilityAnalytics["bookerProfitability"][number];

const BAND: Record<Verdict["band"], { dot: string; label: string; fg: string }> = {
  winning: { dot: "bg-teal", label: "Winning", fg: "text-teal" },
  surviving: { dot: "bg-amber", label: "Fragile", fg: "text-amber" },
  at_risk: { dot: "bg-amber", label: "Watch", fg: "text-amber" },
  losing: { dot: "bg-rausch", label: "Losing money", fg: "text-rausch" },
  unsustainable: { dot: "bg-rausch", label: "Unsustainable", fg: "text-rausch" },
};

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ExecutiveOverviewClient({ profitability, forecast, firstName }: { profitability: ProfitabilityAnalytics; forecast: ForecastAnalytics; firstName: string }) {
  const [drawer, setDrawer] = useState<{ type: "unit"; id: string } | { type: "booker"; id: string } | { type: "forecast" } | null>(null);

  const { income, profitViews, waterfall, breakEven, unitEconomics, bookerProfitability, sourceProfitability, healthVerdict, redFlags, brutalTruths, topActions, revenueGrowthPct, marginTrendPct } = profitability;
  const { summary, weekdayRows } = forecast;

  const sortedUnits = useMemo(() => [...unitEconomics].sort((a, b) => b.fullyLoadedProfitCentavos - a.fullyLoadedProfitCentavos), [unitEconomics]);
  const worstUnit = sortedUnits[sortedUnits.length - 1] ?? null;
  const bestUnit = sortedUnits[0] ?? null;
  const avgOccupancyPct = unitEconomics.length > 0 ? Math.round(unitEconomics.reduce((s, u) => s + u.occupancyPct, 0) / unitEconomics.length) : 0;
  const bestDemandDay = [...weekdayRows].sort((a, b) => b.forecastDemandIndex - a.forecastDemandIndex)[0] ?? null;
  const topSource = [...sourceProfitability].sort((a, b) => b.grossRevenueCentavos - a.grossRevenueCentavos)[0] ?? null;

  const activeUnit = drawer?.type === "unit" ? sortedUnits.find((u) => u.unitId === drawer.id) ?? null : null;
  const activeBooker = drawer?.type === "booker" ? bookerProfitability.find((b) => b.employeeId === drawer.id) ?? null : null;

  const simulatorBaseline = {
    adrPesos: forecast.revenueMetrics.adrPesos.actual,
    occupancyPct: avgOccupancyPct,
    bookingsPerMonth: unitEconomics.reduce((s, u) => s + u.bookingCount, 0),
    grossRevenuePesos: income.grossRevenueCentavos / 100,
    electricityPesos: profitability.expense.variable.electricityCentavos / 100,
    waterPesos: profitability.expense.variable.waterCentavos / 100,
    payrollPesos: profitability.expense.payroll.totalCentavos / 100,
    marketingPesos: profitability.expense.variable.marketingCentavos / 100,
    fixedCostsPesos: profitability.expense.fixed.totalCentavos / 100,
    operationalPesos: profitability.expense.variable.operationalCentavos / 100,
  };

  return (
    <div className="space-y-5">
      {/* 1 — Hero header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--ink)]">Good morning, {firstName}.</h1>
          <p className="mt-0.5 text-[13px] text-[var(--gray)]">{unitEconomics.length} active units</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${BAND[healthVerdict.band].dot}`} />
          <span className={`text-[13px] font-bold ${BAND[healthVerdict.band].fg}`}>{BAND[healthVerdict.band].label}</span>
        </div>
      </div>
      <p className="-mt-3 text-[14px] leading-relaxed text-[var(--ink)]">{healthVerdict.headline}</p>

      {/* 2 — Executive pulse: compact KPI density, not a wall of cards */}
      <div className="card overflow-x-auto p-4">
        <div className="flex min-w-max divide-x divide-[var(--line)]">
          <Pulse label="Revenue" value={pesoCentavos(income.collectedRevenueCentavos)} delta={revenueGrowthPct} deltaUnit="%" />
          <Pulse label="Economic profit" value={pesoCentavos(profitViews.economicProfitCentavos)} tone={profitViews.economicProfitCentavos < 0 ? "bad" : "good"} />
          <Pulse label="Margin" value={`${profitViews.economicMarginPct}%`} delta={marginTrendPct} deltaUnit="pts" tone={profitViews.economicMarginPct < 0 ? "bad" : "good"} />
          <Pulse label="Occupancy" value={`${avgOccupancyPct}%`} />
          <Pulse label="ADR" value={peso(forecast.revenueMetrics.adrPesos.actual)} />
          <Pulse label="Break-even" value={pesoCentavos(breakEven.breakEvenRevenueCentavos)} />
        </div>
      </div>

      {/* 3 — What needs your attention */}
      <div className="card p-4">
        <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">What needs your attention</h3>
        <div className="divide-y divide-[var(--line)]">
          {worstUnit && (
            <AttentionRow
              tone="bad"
              title={formatUnitDisplay(worstUnit.unitNumber, worstUnit.name)}
              metric={`${worstUnit.fullyLoadedMarginPct}% margin`}
              detail="Revenue is not translating into profit."
              cta="View unit"
              onClick={() => setDrawer({ type: "unit", id: worstUnit.unitId })}
            />
          )}
          {redFlags.find((f) => f.label === "Fixed costs too high") && (
            <AttentionRow
              tone="warn"
              title="Fixed costs"
              metric={`${income.grossRevenueCentavos > 0 ? Math.round(((profitability.expense.fixed.totalCentavos + profitability.expense.payroll.salaryCentavos) / income.grossRevenueCentavos) * 100) : 0}% of revenue`}
              detail="Your cost structure is limiting profitability."
              cta="Analyze costs"
              onClick={() => document.getElementById("waterfall-narrative")?.scrollIntoView({ behavior: "smooth" })}
            />
          )}
          {bestDemandDay && bestDemandDay.forecastDemandIndex >= 110 && (
            <AttentionRow
              tone="good"
              title={`${DOW_SHORT[bestDemandDay.dow]} demand`}
              metric={`${bestDemandDay.occupancyPct}% occupancy`}
              detail="Strong demand supports a higher rate on this day."
              cta="Test +₱100"
              onClick={() => document.getElementById("decision-lab")?.scrollIntoView({ behavior: "smooth" })}
            />
          )}
        </div>
      </div>

      {/* 4 — Director's brief */}
      {(brutalTruths.length > 0 || topActions.length > 0) && (
        <div className="card p-4">
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">What changed</h3>
          <div className="space-y-2">
            {brutalTruths.slice(0, 3).map((t, i) => (
              <p key={i} className="text-[13.5px] leading-relaxed text-[var(--ink)]">{t.statement}</p>
            ))}
          </div>
          {topActions.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Recommended priorities</h3>
              <ol className="space-y-1.5">
                {topActions.slice(0, 3).map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span><span className="font-bold text-[var(--ink)]">{i + 1}.</span> {a.title}</span>
                    <span className="flex-none font-bold text-teal">+{peso(a.estimatedMonthlyImpactCentavos / 100)}/mo</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {/* 5 — Target */}
      <div className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">This month&apos;s goal</h3>
          <button onClick={() => setDrawer({ type: "forecast" })} className="text-[12px] font-bold text-[var(--skin-primary,#6C5CE7)]">View forecast details →</button>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[26px] font-extrabold tracking-tight">{peso(summary.targetPesos)}</span>
          <span className="text-[13px] text-[var(--gray)]">target · {peso(summary.actualRevenueCentavos / 100)} achieved so far</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
          <div className="h-2 rounded-full bg-[var(--skin-primary,#6C5CE7)]" style={{ width: `${Math.min(100, summary.targetAchievementPct)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[var(--gray)]">
          <span className="font-bold text-[var(--ink)]">{summary.targetAchievementPct}% of target</span>
          <span>Remaining: {peso(summary.remainingPesos)}</span>
        </div>
        {summary.targetProbabilityPct !== null && (
          <p className="mt-2 text-[12.5px] text-[var(--gray)]">
            <span className="font-bold text-[var(--ink)]">{summary.targetProbabilityPct}% modeled chance of hitting the full target.</span>{" "}
            This can look low even when pace metrics are positive — pace compares today&apos;s progress to a typical same-point-in-month average, while this probability asks a harder question: whether the <em>remaining</em> days can realistically make up the gap to 100%.
          </p>
        )}
      </div>

      {/* 6 — Unit performance table */}
      <div className="card overflow-x-auto p-4">
        <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Units</h3>
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="pb-2 pr-3">Unit</th>
              <th className="px-3 pb-2 text-right">Revenue</th>
              <th className="px-3 pb-2 text-right">Occupancy</th>
              <th className="px-3 pb-2 text-right">Profit</th>
              <th className="px-3 pb-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {sortedUnits.map((u) => (
              <tr key={u.unitId} onClick={() => setDrawer({ type: "unit", id: u.unitId })} className="cursor-pointer border-t border-[var(--line)] transition-colors hover:bg-[var(--bg-2)]">
                <td className="py-2.5 pr-3 font-bold">{formatUnitDisplay(u.unitNumber, u.name)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{peso(u.revenueCentavos / 100)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{u.occupancyPct}%</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${u.fullyLoadedProfitCentavos < 0 ? "text-rausch" : ""}`}>{pesoCentavos(u.fullyLoadedProfitCentavos)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${u.fullyLoadedMarginPct < 5 ? "text-rausch" : "text-teal"}`}>{u.fullyLoadedMarginPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bestUnit && worstUnit && bestUnit.unitId !== worstUnit.unitId && (
          <p className="mt-2 text-[11.5px] text-[var(--gray)]">
            #1 by profit: {formatUnitDisplay(bestUnit.unitNumber, bestUnit.name)} · Largest gap: {formatUnitDisplay(worstUnit.unitNumber, worstUnit.name)}
          </p>
        )}
      </div>

      {/* 7 — Waterfall narrative */}
      <div id="waterfall-narrative" className="card p-4">
        <h3 className="mb-1 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Where your ₱100 goes</h3>
        <WaterfallNarrative waterfall={waterfall} grossRevenueCentavos={income.grossRevenueCentavos} />
      </div>

      {/* 8 — Break-even distance */}
      <div className="card p-4">
        <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Distance to break-even</h3>
        <BreakEvenDistance breakEven={breakEven} grossRevenueCentavos={income.grossRevenueCentavos} />
      </div>

      {/* 9 — Pricing intelligence */}
      <div className="card p-4">
        <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">When should you charge more?</h3>
        <div className="flex items-end gap-2">
          {weekdayRows.map((r) => (
            <div key={r.dow} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end rounded-md bg-[var(--bg-2)]">
                <div
                  className={`w-full rounded-md ${r.forecastDemandIndex >= 110 ? "bg-teal" : r.forecastDemandIndex <= 90 ? "bg-rausch" : "bg-[var(--skin-primary,#6C5CE7)]"}`}
                  style={{ height: `${Math.min(100, Math.max(6, r.occupancyPct))}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-[var(--gray)]">{DOW_SHORT[r.dow]}</span>
              <span className="text-[10.5px] text-[var(--gray)]">{r.occupancyPct}%</span>
            </div>
          ))}
        </div>
        {bestDemandDay && bestDemandDay.forecastDemandIndex >= 110 && topActions[0] && (
          <p className="mt-3 text-[12.5px] text-[var(--gray)]">
            <span className="font-bold text-teal">Opportunity: </span>
            {DOW_SHORT[bestDemandDay.dow]} demand index is {bestDemandDay.forecastDemandIndex} (100 = average) — {topActions[0].title.toLowerCase()} for an estimated <span className="font-bold text-[var(--ink)]">+{peso(topActions[0].estimatedMonthlyImpactCentavos / 100)}/month</span>.
          </p>
        )}
      </div>

      {/* 10 — Decision Lab */}
      <div id="decision-lab">
        <WhatIfSimulator baseline={simulatorBaseline} title="Decision Lab" />
      </div>

      {/* 11 — Booker performance */}
      {bookerProfitability.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Booker performance</h3>
          <div className="divide-y divide-[var(--line)]">
            {bookerProfitability.filter((b) => b.bookings > 0).slice(0, 6).map((b) => (
              <button key={b.employeeId} onClick={() => setDrawer({ type: "booker", id: b.employeeId })} className="flex w-full items-center justify-between py-2.5 text-left transition-colors hover:bg-[var(--bg-2)]">
                <span className="text-[13.5px] font-bold">{b.name}</span>
                <span className="text-[13.5px] font-bold">{pesoCentavos(b.netProfitCentavos)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unit detail drawer */}
      <Drawer open={!!activeUnit} onClose={() => setDrawer(null)} title={activeUnit ? formatUnitDisplay(activeUnit.unitNumber, activeUnit.name) : ""} sub="Unit economics">
        {activeUnit && <UnitDetail unit={activeUnit} onOpenSimulator={() => { setDrawer(null); document.getElementById("decision-lab")?.scrollIntoView({ behavior: "smooth" }); }} />}
      </Drawer>

      {/* Booker detail drawer */}
      <Drawer open={!!activeBooker} onClose={() => setDrawer(null)} title={activeBooker?.name ?? ""} sub="Booker profitability">
        {activeBooker && <BookerDetail booker={activeBooker} />}
      </Drawer>

      {/* Forecast sheet */}
      <Drawer open={drawer?.type === "forecast"} onClose={() => setDrawer(null)} title="Month-end forecast" sub={summary.confidence.label}>
        <ForecastSheet summary={summary} />
      </Drawer>
    </div>
  );
}

function Pulse({ label, value, delta, deltaUnit, tone }: { label: string; value: string; delta?: number | null; deltaUnit?: "%" | "pts"; tone?: "good" | "bad" }) {
  const cls = tone === "bad" ? "text-rausch" : tone === "good" ? "text-teal" : "text-[var(--ink)]";
  return (
    <div className="flex-none px-4 first:pl-0 last:pr-0">
      <div className="text-[11px] font-semibold text-[var(--gray)]">{label}</div>
      <div className={`mt-0.5 text-[17px] font-extrabold tracking-tight ${cls}`}>{value}</div>
      {delta !== undefined && delta !== null && (
        <div className={`text-[11px] font-bold ${delta >= 0 ? "text-teal" : "text-rausch"}`}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}{deltaUnit === "pts" ? " pts" : "%"}
        </div>
      )}
    </div>
  );
}

function AttentionRow({ tone, title, metric, detail, cta, onClick }: { tone: "bad" | "warn" | "good"; title: string; metric: string; detail: string; cta: string; onClick: () => void }) {
  const dot = tone === "bad" ? "bg-rausch" : tone === "warn" ? "bg-amber" : "bg-teal";
  const ctaColor = tone === "bad" ? "text-rausch" : tone === "warn" ? "text-amber" : "text-teal";
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${dot}`} />
        <div>
          <div className="text-[13.5px] font-bold">{title} <span className="font-extrabold">{metric}</span></div>
          <div className="text-[12px] text-[var(--gray)]">{detail}</div>
        </div>
      </div>
      <button onClick={onClick} className={`flex-none text-[12.5px] font-bold ${ctaColor}`}>{cta} →</button>
    </div>
  );
}

function WaterfallNarrative({ waterfall, grossRevenueCentavos }: { waterfall: ProfitabilityAnalytics["waterfall"]; grossRevenueCentavos: number }) {
  const scale = 100;
  return (
    <div className="space-y-2">
      {waterfall.map((s, i) => {
        const isEdge = i === 0 || i === waterfall.length - 1;
        const per100 = grossRevenueCentavos > 0 ? Math.round((Math.abs(isEdge ? s.runningTotalCentavos : s.deltaCentavos) / grossRevenueCentavos) * scale) : 0;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-[190px] flex-none truncate text-[12.5px] text-[var(--gray)]">{s.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
              <div className={`h-2 rounded-full ${isEdge ? "bg-[var(--skin-primary,#6C5CE7)]" : "bg-[var(--gray)]"}`} style={{ width: `${Math.min(100, per100)}%` }} />
            </div>
            <span className="w-16 flex-none text-right text-[12.5px] font-bold tabular-nums">₱{per100}</span>
          </div>
        );
      })}
    </div>
  );
}

function BreakEvenDistance({ breakEven, grossRevenueCentavos }: { breakEven: ProfitabilityAnalytics["breakEven"]; grossRevenueCentavos: number }) {
  const distanceCentavos = grossRevenueCentavos - breakEven.breakEvenRevenueCentavos;
  const above = distanceCentavos >= 0;
  const scaleMax = Math.max(grossRevenueCentavos, breakEven.breakEvenRevenueCentavos) * 1.1 || 1;
  const revenuePct = Math.min(100, (grossRevenueCentavos / scaleMax) * 100);
  const breakEvenPct = Math.min(100, (breakEven.breakEvenRevenueCentavos / scaleMax) * 100);
  return (
    <div>
      <div className="relative h-3 w-full rounded-full bg-[var(--bg-2)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--skin-primary,#6C5CE7)]" style={{ width: `${revenuePct}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-[var(--ink)]" style={{ left: `${breakEvenPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-[var(--gray)]">
        <span>Revenue: <span className="font-bold text-[var(--ink)]">{pesoCentavos(grossRevenueCentavos)}</span></span>
        <span>Break-even: <span className="font-bold text-[var(--ink)]">{pesoCentavos(breakEven.breakEvenRevenueCentavos * 100 / 100)}</span></span>
      </div>
      <p className={`mt-2 text-[13px] font-bold ${above ? "text-teal" : "text-rausch"}`}>
        {above ? `Only ${pesoCentavos(distanceCentavos)} above break-even` : `${pesoCentavos(Math.abs(distanceCentavos))} below break-even`}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3 text-[12px] text-[var(--gray)]">
        <span>Bookings needed: <span className="font-bold text-[var(--ink)]">{breakEven.breakEvenBookings}</span></span>
        <span>Occupancy needed: <span className="font-bold text-[var(--ink)]">{breakEven.breakEvenOccupancyPct}%</span></span>
        <span>ADR (current): <span className="font-bold text-[var(--ink)]">{peso(breakEven.breakEvenAdrCentavos / 100)}</span></span>
      </div>
    </div>
  );
}

function UnitDetail({ unit, onOpenSimulator }: { unit: UnitRow; onOpenSimulator: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Revenue" value={pesoCentavos(unit.revenueCentavos)} />
        <Stat label="Occupancy" value={`${unit.occupancyPct}%`} />
        <Stat label="ADR" value={pesoCentavos(unit.adrCentavos)} />
        <Stat label="RevPAR" value={pesoCentavos(unit.revparCentavos)} />
        <Stat label="Fully-loaded profit" value={pesoCentavos(unit.fullyLoadedProfitCentavos)} tone={unit.fullyLoadedProfitCentavos < 0 ? "bad" : "good"} />
        <Stat label="Margin" value={`${unit.fullyLoadedMarginPct}%`} tone={unit.fullyLoadedMarginPct < 5 ? "bad" : "good"} />
        <Stat label="Break-even occupancy" value={`${unit.breakEvenOccupancyPct}%`} />
        <Stat label="Profit / night" value={pesoCentavos(unit.profitPerOccupiedNightCentavos)} />
      </div>
      <div className="rounded-xl border border-[var(--line)] p-3">
        <div className="text-[12px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Why</div>
        <p className="mt-1 text-[13px] text-[var(--ink)]">
          {unit.occupancyPct < unit.breakEvenOccupancyPct
            ? "Occupancy is below what this unit needs to cover its own costs plus its share of portfolio-wide overhead."
            : "Occupancy covers break-even, but the shared-cost burden is limiting how much profit converts through."}
        </p>
        <div className="mt-2 text-[12px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Recommended</div>
        <p className="mt-1 text-[13px] text-[var(--ink)]">Increase occupancy or ADR, or reduce this unit&apos;s direct expenses — try it in the simulator.</p>
        <button onClick={onOpenSimulator} className="btn-sm btn-primary mt-2">Open simulator</button>
      </div>
    </div>
  );
}

function BookerDetail({ booker }: { booker: BookerRow }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Bookings" value={String(booker.bookings)} />
      <Stat label="Gross revenue" value={pesoCentavos(booker.grossRevenueCentavos)} />
      <Stat label="Commission" value={pesoCentavos(booker.commissionCentavos)} />
      <Stat label="Net profit" value={pesoCentavos(booker.netProfitCentavos)} tone={booker.netProfitCentavos < 0 ? "bad" : "good"} />
      <Stat label="Profit / booking" value={pesoCentavos(booker.profitPerBookingCentavos)} />
      <Stat label="Cancellation rate" value={`${booker.cancellationRatePct}%`} tone={booker.cancellationRatePct > 15 ? "bad" : undefined} />
    </div>
  );
}

function ForecastSheet({ summary }: { summary: ForecastAnalytics["summary"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--line)] p-3 text-center">
          <div className="text-[11px] font-bold uppercase text-[var(--gray)]">Conservative</div>
          <div className="mt-1 text-[15px] font-extrabold">{pesoCentavos(summary.scenarios.conservative.revenueCentavos)}</div>
        </div>
        <div className="rounded-xl border border-[var(--skin-primary,#6C5CE7)]/40 bg-[var(--skin-primary,#6C5CE7)]/5 p-3 text-center">
          <div className="text-[11px] font-bold uppercase text-[var(--gray)]">Expected</div>
          <div className="mt-1 text-[15px] font-extrabold">{pesoCentavos(summary.scenarios.expected.revenueCentavos)}</div>
        </div>
        <div className="rounded-xl border border-[var(--line)] p-3 text-center">
          <div className="text-[11px] font-bold uppercase text-[var(--gray)]">Optimistic</div>
          <div className="mt-1 text-[15px] font-extrabold">{pesoCentavos(summary.scenarios.optimistic.revenueCentavos)}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-[13px]">
        <div className="flex justify-between"><span className="text-[var(--gray)]">Target</span><span className="font-bold">{peso(summary.targetPesos)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--gray)]">Expected shortfall</span><span className="font-bold text-rausch">{peso(Math.max(0, summary.targetPesos - summary.scenarios.expected.revenueCentavos / 100))}</span></div>
        <div className="flex justify-between"><span className="text-[var(--gray)]">Confidence</span><span className="font-bold">{summary.confidence.label}</span></div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const cls = tone === "bad" ? "text-rausch" : tone === "good" ? "text-teal" : "text-[var(--ink)]";
  return (
    <div>
      <div className="text-[11px] font-semibold text-[var(--gray)]">{label}</div>
      <div className={`mt-0.5 text-[16px] font-extrabold ${cls}`}>{value}</div>
    </div>
  );
}
