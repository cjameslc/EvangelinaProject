"use client";

import { useMemo, useState } from "react";
import { peso, pesoCentavos, formatUnitDisplay } from "@/lib/format";
import { computePortfolioTargetLadder, computeLadderGaps, tierForUnitRevenue, DEFAULT_TARGET_TIERS, type TargetTierBand } from "@/lib/analytics/targetTiers";
import { useAttentionItems } from "../hooks/useAttentionItems";
import type { Unit, Booking, HkState, AttentionFinding, Stock, Bill } from "../types";
import type { UnitGoal } from "@/lib/analytics/revenueGoals";

const TIER_STYLE: Record<TargetTierBand, { fg: string; bg: string }> = {
  underperforming: { fg: "text-rausch", bg: "bg-rausch/10" },
  baseline: { fg: "text-amber", bg: "bg-amber/10" },
  good: { fg: "text-teal", bg: "bg-teal/10" },
  strong: { fg: "text-teal", bg: "bg-teal/10" },
  exceptional: { fg: "text-[var(--skin-primary,#6C5CE7)]", bg: "bg-[var(--skin-primary,#6C5CE7)]/10" },
};

// The redesigned "understand the business in 30 seconds" hero for the Main
// Dashboard — sits above every existing section (all preserved, unchanged,
// below this). Zero new data fetching: every number here is presentation
// over hook outputs DashboardView.tsx already computes (useMonthlyProfit
// Summary, useEarningsData, useRevenueGoalsPanelData) plus the new, real,
// configurable tiered target engine (targetTiers.ts) replacing the old
// binary "₱50K or nothing" framing. useAttentionItems is called again here
// (cheap — pure useMemo, no I/O) rather than lifted out of
// NeedsAttentionSection, so that already-shipped, already-tested component
// stays untouched.
export function ExecutiveDashboardOverview({
  firstName,
  units,
  unitGoals,
  netProfitRaw,
  marginRaw,
  cashFlowRaw,
  filteredOccupancy,
  filteredAdr,
  filteredRevpar,
  periodPhrase,
  displayedPeriodIncome,
  periodSalary,
  platformBreakdown,
  overdueCentavos,
  billsDueMonthCentavos,
  billsPaidMonthCentavos,
  attentionFindings,
  bookingsWeek,
  bookingsMonth,
  hkStates,
  cleaningLogsRecent,
  stocks,
  expenseRequestsMonth,
  pendingGuestRequests,
  dueBills,
  dueDateFor,
  billMeta,
  batteryStats,
  lockedUnits,
  batteryTier,
  upcomingCheckinRiskUnits,
  reserveCodeStats,
  dismissedAttentionKeys,
  todayIso,
  unitStatus,
}: {
  firstName: string;
  units: Unit[];
  unitGoals: UnitGoal[];
  netProfitRaw: number;
  marginRaw: number;
  cashFlowRaw: number;
  filteredOccupancy: number;
  filteredAdr: number;
  filteredRevpar: number;
  periodPhrase: string;
  displayedPeriodIncome: number;
  periodSalary: number;
  platformBreakdown: { platform: string; label: string; bookings: number; nights: number; revenue: number }[];
  overdueCentavos: number;
  billsDueMonthCentavos: number;
  billsPaidMonthCentavos: number;
  // Everything below is passed straight through to useAttentionItems,
  // identical to what NeedsAttentionSection already receives — see that
  // component's own props for the authoritative shape of each.
  attentionFindings: AttentionFinding[];
  bookingsWeek: Booking[];
  bookingsMonth: Booking[];
  hkStates: HkState[];
  cleaningLogsRecent: { id: string; unitId: string; startedAt: string; endedAt: string | null; employee: { name: string } | null }[];
  stocks: Stock[];
  expenseRequestsMonth: { id: string; category: string; amount: number; status: string; date: string; employee: { name: string } | null }[];
  pendingGuestRequests: { id: string; type: string; message: string | null; priority: string; photoUrl: string | null; createdAt: string; unit: { shortName: string } | null; guest: { name: string | null; email: string } | null }[];
  dueBills: Bill[];
  dueDateFor: (b: Bill) => Date | null;
  billMeta: (b: Bill) => { icon: string; label: string; sub: string };
  batteryStats: { healthy: number; low: number; critical: number; offline: number; average: number | null; lastUpdated: string | null };
  lockedUnits: Unit[];
  batteryTier: (pct: number | null | undefined) => "critical" | "low" | "healthy" | null;
  upcomingCheckinRiskUnits: { unit: Unit; nextCheckInAt: Date; tier: "critical" | "low" | "offline" }[];
  reserveCodeStats: { byUnit: Map<string, { total: number; available: number }>; total: number; available: number; inUse: number; exhaustedUnits: Unit[] };
  dismissedAttentionKeys: string[];
  todayIso: string;
  unitStatus: (unit: Unit) => { label: string; dot: string };
}) {
  const [showAllUnits, setShowAllUnits] = useState(false);

  const dismissedSet = useMemo(() => new Set(dismissedAttentionKeys), [dismissedAttentionKeys]);
  const attentionItems = useAttentionItems({
    attentionFindings, units, bookingsWeek, bookingsMonth, hkStates, cleaningLogsRecent, stocks, expenseRequestsMonth,
    pendingGuestRequests, dueBills, dueDateFor, billMeta, batteryStats, lockedUnits, batteryTier, upcomingCheckinRiskUnits,
    reserveCodeStats, dismissedKeys: dismissedSet, todayIso,
  });

  const ladder = useMemo(() => computePortfolioTargetLadder(units.length), [units.length]);
  const portfolioCurrentPesos = unitGoals.reduce((s, g) => s + g.currentPesos, 0);
  const gaps = useMemo(() => computeLadderGaps(portfolioCurrentPesos, ladder), [portfolioCurrentPesos, ladder]);
  // Real month-end REVENUE forecast — the sum of each unit's own
  // projectedPesos (computeUnitGoal, already the app's one real per-unit
  // revenue projection). Deliberately not forecastProfitCents, which is a
  // PROFIT projection — adding it to current revenue would silently mix
  // two different units of measure into a meaningless number.
  const forecastPesos = unitGoals.reduce((s, g) => s + g.projectedPesos, 0);

  // Business health verdict — same 3-signal logic (margin, portfolio band,
  // net profit sign) already proven in the Analytics Business Health
  // Verdict this session, expressed here against the tiered band instead
  // of a single target.
  const verdict = useMemo(() => {
    if (netProfitRaw < 0) return { emoji: "🔴", label: "Losing money", fg: "text-rausch", reason: "Revenue this month is not covering real costs." };
    if (gaps.currentBand === "underperforming") return { emoji: "🟠", label: "At risk", fg: "text-amber", reason: `Portfolio revenue is below the ${peso(DEFAULT_TARGET_TIERS.baseline.perUnitPesos)}/unit baseline pace.` };
    if (gaps.currentBand === "baseline") return { emoji: "🟡", label: "Watch", fg: "text-amber", reason: "Portfolio revenue is near the realistic baseline, below the stretch target." };
    return { emoji: "🟢", label: "On track", fg: "text-teal", reason: `Portfolio revenue is in the ${DEFAULT_TARGET_TIERS[gaps.currentBand].label.toLowerCase()} band.` };
  }, [netProfitRaw, gaps]);

  const worstUnit = useMemo(() => [...unitGoals].sort((a, b) => a.currentPesos - b.currentPesos)[0] ?? null, [unitGoals]);
  const sortedUnits = useMemo(() => [...unitGoals].sort((a, b) => b.currentPesos - a.currentPesos), [unitGoals]);
  const visibleUnits = showAllUnits ? sortedUnits : sortedUnits.slice(0, 5);
  const topChannels = useMemo(() => [...platformBreakdown].sort((a, b) => b.revenue - a.revenue).slice(0, 4), [platformBreakdown]);
  const totalChannelRevenue = platformBreakdown.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="mb-8 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Good morning, {firstName}.</h1>
          <p className="mt-0.5 text-[13px] text-[var(--gray)]">
            {units.length} active units
            <span className="ml-2 rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-bold text-amber align-middle">★ Superhost</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[15px]">{verdict.emoji}</span>
          <span className={`text-[13px] font-bold ${verdict.fg}`}>{verdict.label}</span>
        </div>
      </div>
      <p className="-mt-3 text-[14px] leading-relaxed text-[var(--ink)]">{verdict.reason}</p>

      {/* Executive pulse */}
      <div className="card overflow-x-auto p-4">
        <div className="flex min-w-max divide-x divide-[var(--line)]">
          <Pulse label="Revenue" value={peso(portfolioCurrentPesos)} />
          <Pulse label="Profit" value={peso(netProfitRaw)} tone={netProfitRaw < 0 ? "bad" : "good"} />
          <Pulse label="Occupancy" value={`${filteredOccupancy}%`} />
          <Pulse label="Forecast" value={peso(forecastPesos)} />
          <Pulse label="Baseline" value={peso(ladder.baselinePesos)} />
          <Pulse label="Stretch" value={peso(ladder.stretchPesos)} />
        </div>
        <p className="mt-2 text-[12px] text-[var(--gray)]">Occupancy/ADR/RevPAR follow the {periodPhrase} filter below · everything else is always this month.</p>
      </div>

      {/* Realistic target / forecast */}
      <div className="card p-4">
        <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">This month&apos;s target ladder</h3>
        <TargetLadder ladder={ladder} currentPesos={portfolioCurrentPesos} forecastPesos={forecastPesos} />
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <GapStat label="To baseline" gapPesos={gaps.toBaselinePesos} />
          <GapStat label="To good" gapPesos={gaps.toGoodPesos} />
          <GapStat label="To strong" gapPesos={gaps.toStrongPesos} />
          <GapStat label="To stretch" gapPesos={gaps.toStretchPesos} />
        </div>
      </div>

      {/* Director alerts */}
      {attentionItems.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Needs your decision</h3>
          <div className="divide-y divide-[var(--line)]">
            {attentionItems.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${item.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold">{item.title}</div>
                  <div className="truncate text-[12px] text-[var(--gray)]">{item.desc}</div>
                </div>
                {item.href && <a href={item.href} className="flex-none text-[12px] font-bold text-[var(--skin-primary,#6C5CE7)]">Review →</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Business performance */}
      <div className="card p-4">
        <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">How is the business performing?</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Profit margin" value={`${marginRaw}%`} tone={marginRaw < 0 ? "bad" : "good"} />
          <Stat label="Cash flow" value={peso(cashFlowRaw)} tone={cashFlowRaw < 0 ? "bad" : "good"} />
          <Stat label="Occupancy" value={`${filteredOccupancy}%`} />
          <Stat label="ADR" value={peso(filteredAdr)} />
          <Stat label="RevPAR" value={peso(filteredRevpar)} />
          <Stat label="Revenue" value={peso(portfolioCurrentPesos)} />
        </div>
      </div>

      {/* Unit performance */}
      <div className="card overflow-x-auto p-4">
        <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Units</h3>
        <table className="w-full min-w-[480px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="pb-2 pr-3">Unit</th>
              <th className="px-3 pb-2 text-right">Revenue</th>
              <th className="px-3 pb-2 text-right">To baseline</th>
              <th className="px-3 pb-2 text-right">Tier</th>
            </tr>
          </thead>
          <tbody>
            {visibleUnits.map((g) => {
              const tier = tierForUnitRevenue(g.currentPesos);
              const style = TIER_STYLE[tier.band];
              const toBaseline = Math.round(DEFAULT_TARGET_TIERS.baseline.perUnitPesos - g.currentPesos);
              return (
                <tr key={g.unitId} className="border-t border-[var(--line)]">
                  <td className="py-2.5 pr-3 font-bold">{g.unitLabel}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{peso(g.currentPesos)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--gray)]">{toBaseline > 0 ? `-${peso(toBaseline)}` : peso(Math.abs(toBaseline))}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${style.bg} ${style.fg}`}>{tier.emoji} {tier.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedUnits.length > 5 && (
          <button onClick={() => setShowAllUnits((v) => !v)} className="mt-2 text-[12px] font-bold text-[var(--skin-primary,#6C5CE7)]">
            {showAllUnits ? "Show fewer" : `Show all ${sortedUnits.length}`}
          </button>
        )}
        {worstUnit && (
          <p className="mt-2 text-[11.5px] text-[var(--gray)]">Largest baseline gap: {worstUnit.unitLabel}</p>
        )}
      </div>

      {/* Owner cash */}
      <div className="card p-4">
        <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Cash after payroll</h3>
        <div className="flex items-baseline gap-3">
          <span className="text-[22px] font-extrabold tracking-tight">{peso(displayedPeriodIncome - periodSalary)}</span>
          <span className="text-[12px] text-[var(--gray)]">{peso(displayedPeriodIncome)} collected − {peso(periodSalary)} salary, {periodPhrase}</span>
        </div>
      </div>

      {/* Channel performance */}
      {topChannels.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Revenue by channel</h3>
          <div className="space-y-2">
            {topChannels.map((c) => (
              <div key={c.platform} className="flex items-center justify-between text-[13px]">
                <span className="font-bold">{c.label}</span>
                <span className="text-[var(--gray)]">{peso(c.revenue)} · {totalChannelRevenue > 0 ? Math.round((c.revenue / totalChannelRevenue) * 100) : 0}%</span>
              </div>
            ))}
          </div>
          {topChannels.length >= 2 && totalChannelRevenue > 0 && (
            <p className="mt-2 text-[12px] text-[var(--gray)]">
              {topChannels[0].label} + {topChannels[1].label} generate {Math.round(((topChannels[0].revenue + topChannels[1].revenue) / totalChannelRevenue) * 100)}% of current revenue.
            </p>
          )}
        </div>
      )}

      {/* Cash obligations */}
      <div className="card p-4">
        <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Cash obligations</h3>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Overdue" value={pesoCentavos(overdueCentavos)} tone={overdueCentavos > 0 ? "bad" : undefined} />
          <Stat label="Pending" value={pesoCentavos(billsDueMonthCentavos)} />
          <Stat label="Paid" value={pesoCentavos(billsPaidMonthCentavos)} />
        </div>
      </div>
    </div>
  );
}

function Pulse({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const cls = tone === "bad" ? "text-rausch" : tone === "good" ? "text-teal" : "text-[var(--ink)]";
  return (
    <div className="flex-none px-4 first:pl-0 last:pr-0">
      <div className="text-[11px] font-semibold text-[var(--gray)]">{label}</div>
      <div className={`mt-0.5 text-[17px] font-extrabold tracking-tight ${cls}`}>{value}</div>
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

function GapStat({ label, gapPesos }: { label: string; gapPesos: number }) {
  const cleared = gapPesos <= 0;
  return (
    <div>
      <div className="text-[11px] font-semibold text-[var(--gray)]">{label}</div>
      <div className={`mt-0.5 text-[14px] font-extrabold ${cleared ? "text-teal" : "text-[var(--ink)]"}`}>
        {cleared ? `+${peso(Math.abs(gapPesos))}` : `-${peso(gapPesos)}`}
      </div>
    </div>
  );
}

function TargetLadder({ ladder, currentPesos, forecastPesos }: { ladder: ReturnType<typeof computePortfolioTargetLadder>; currentPesos: number; forecastPesos: number }) {
  const max = ladder.stretchPesos * 1.05 || 1;
  const rungs: { label: string; pesos: number }[] = [
    { label: "Baseline", pesos: ladder.baselinePesos },
    { label: "Good", pesos: ladder.goodPesos },
    { label: "Strong", pesos: ladder.strongPesos },
    { label: "Stretch", pesos: ladder.stretchPesos },
  ];
  const currentPct = Math.min(100, (currentPesos / max) * 100);
  const forecastPct = Math.min(100, (forecastPesos / max) * 100);
  return (
    <div>
      <div className="relative h-3 w-full rounded-full bg-[var(--bg-2)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--skin-primary,#6C5CE7)]" style={{ width: `${currentPct}%` }} />
        <div className="absolute inset-y-0 w-0.5 border-l-2 border-dashed border-[var(--ink)]" style={{ left: `${forecastPct}%` }} />
        {rungs.map((r) => (
          <div key={r.label} className="absolute top-0 h-3 w-px bg-[var(--ink)]/30" style={{ left: `${Math.min(100, (r.pesos / max) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap justify-between text-[10.5px] text-[var(--gray)]">
        {rungs.map((r) => (
          <span key={r.label}>{r.label} {peso(r.pesos)}</span>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-[var(--gray)]">
        Current: <span className="font-bold text-[var(--ink)]">{peso(currentPesos)}</span> · Forecast: <span className="font-bold text-[var(--ink)]">{peso(forecastPesos)}</span>
      </p>
    </div>
  );
}
