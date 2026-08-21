"use client";

import { peso, pesoCentavos, formatUnitDisplay } from "@/lib/format";
import type { ProfitabilityAnalytics } from "@/app/analytics/queries";
import { WhatIfSimulator } from "@/components/analytics/WhatIfSimulator";

function StatBlock({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "neutral" }) {
  const cls = tone === "good" ? "text-teal" : tone === "bad" ? "text-rausch" : "text-[var(--ink)]";
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className={`mt-1 text-[19px] font-extrabold tracking-tight ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] font-semibold text-[var(--gray)]">{sub}</div>}
    </div>
  );
}

const DIFFICULTY_STYLE: Record<string, string> = { low: "bg-teal/10 text-teal", medium: "bg-amber/10 text-amber", high: "bg-rausch/10 text-rausch" };
const RISK_STYLE: Record<string, string> = { low: "bg-teal/10 text-teal", medium: "bg-amber/10 text-amber", high: "bg-rausch/10 text-rausch" };

export function ProfitabilitySectionClient({ data }: { data: ProfitabilityAnalytics }) {
  const { income, expense, profitViews, waterfall, breakEven, contributionByStayType, unitEconomics, bookerProfitability, sourceProfitability, redFlags, brutalTruths, statusQuoProjection, topActions, revenueGrowthPct, expenseGrowthPct, marginTrendPct, discountToGrossPct, topSourceRevenueSharePct } = data;

  const keepPct = income.grossRevenueCentavos > 0 ? Math.round((waterfall[waterfall.length - 1].runningTotalCentavos / income.grossRevenueCentavos) * 100) : 0;

  const simulatorBaseline = {
    adrPesos: breakEven.breakEvenAdrCentavos / 100,
    occupancyPct: unitEconomics.length > 0 ? Math.round(unitEconomics.reduce((s, u) => s + u.occupancyPct, 0) / unitEconomics.length) : 0,
    bookingsPerMonth: breakEven.breakEvenBookings > 0 ? breakEven.breakEvenBookings : unitEconomics.reduce((s, u) => s + u.bookingCount, 0),
    grossRevenuePesos: income.grossRevenueCentavos / 100,
    electricityPesos: expense.variable.electricityCentavos / 100,
    waterPesos: expense.variable.waterCentavos / 100,
    payrollPesos: expense.payroll.totalCentavos / 100,
    marketingPesos: expense.variable.marketingCentavos / 100,
    fixedCostsPesos: expense.fixed.totalCentavos / 100,
    operationalPesos: expense.variable.operationalCentavos / 100,
  };

  return (
    <div className="space-y-4">
      {/* Red Flags — brief section 21, prominent right under the verdict */}
      {redFlags.length > 0 && (
        <div className="card border border-rausch/25 bg-rausch/5 p-4">
          <h4 className="mb-2 text-[13.5px] font-extrabold text-rausch">🔴 Red Flags</h4>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {redFlags.map((f, i) => (
              <div key={i} className="text-[12.5px]">
                <span className="font-bold text-rausch">{f.label}</span>
                <span className="text-[var(--gray)]"> — {f.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Income vs Expenses */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Income vs Expenses</h4>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[11.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Income</div>
            <Row label="Gross booking revenue" value={pesoCentavos(income.grossRevenueCentavos)} />
            <Row label="Net (collected) revenue" value={pesoCentavos(income.collectedRevenueCentavos)} />
            <Row label="Discounts given" value={pesoCentavos(income.discountGivenCentavos)} muted />
            <Row label="Total realized income" value={pesoCentavos(income.totalRealizedIncomeCentavos)} bold />
            <Row label="Confirmed future income" value={pesoCentavos(income.confirmedFutureIncomeCentavos)} muted />
            <Row label="Forecasted additional income" value={pesoCentavos(income.forecastedAdditionalIncomeCentavos)} muted />
          </div>
          <div>
            <div className="mb-2 text-[11.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Expenses</div>
            <div className="mb-1 text-[11px] font-bold text-[var(--gray)]">Fixed</div>
            <Row label="Amortization" value={pesoCentavos(expense.fixed.amortizationCentavos)} small />
            <Row label="Internet" value={pesoCentavos(expense.fixed.internetCentavos)} small />
            <Row label="Association dues" value={pesoCentavos(expense.fixed.associationDuesCentavos)} small />
            <Row label="Subscriptions" value={pesoCentavos(expense.fixed.subscriptionsCentavos)} small />
            <Row label="Other recurring" value={pesoCentavos(expense.fixed.otherFixedCentavos)} small />
            <div className="mb-1 mt-2 text-[11px] font-bold text-[var(--gray)]">Variable</div>
            <Row label="Electricity" value={pesoCentavos(expense.variable.electricityCentavos)} small />
            <Row label="Water" value={pesoCentavos(expense.variable.waterCentavos)} small />
            <Row label="Marketing (ads)" value={pesoCentavos(expense.variable.marketingCentavos)} small />
            <Row label="Operational (supplies, cleaning, misc.)" value={pesoCentavos(expense.variable.operationalCentavos)} small />
            <div className="mb-1 mt-2 text-[11px] font-bold text-[var(--gray)]">Payroll</div>
            <Row label="Salary (accrued)" value={pesoCentavos(expense.payroll.salaryCentavos)} small />
            <Row label="Booker commissions" value={pesoCentavos(expense.payroll.bookerCommissionsCentavos)} small />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-[var(--bg-2)] p-3">
          <StatBlock label="Paid" value={pesoCentavos(expense.totalPaidCentavos)} sub="Cash actually out the door" />
          <StatBlock label="Accrued (owed)" value={pesoCentavos(expense.totalAccruedCentavos)} sub="Paid + payroll + commission" />
          <StatBlock label="Pending" value={pesoCentavos(expense.totalPendingCentavos)} sub="Unpaid bills, informational" />
        </div>
      </div>

      {/* Profitability Waterfall */}
      <div className="card p-4">
        <h4 className="mb-1 text-[13.5px] font-extrabold">Profitability Waterfall</h4>
        <p className="mb-3 text-[12.5px] text-[var(--gray)]">For every ₱100 you collect, you keep <span className="font-extrabold text-[var(--ink)]">₱{keepPct}</span>.</p>
        <div className="space-y-1.5">
          {waterfall.map((s, i) => {
            const isFinal = i === waterfall.length - 1;
            const isFirst = i === 0;
            return (
              <div key={s.label} className={`flex items-center justify-between rounded-lg px-3 py-2 text-[12.5px] ${isFinal ? "bg-[var(--skin-primary,#6C5CE7)]/10 font-extrabold" : isFirst ? "bg-[var(--bg-2)] font-extrabold" : ""}`}>
                <span>{s.label}</span>
                <span className={isFinal || isFirst ? "" : s.deltaCentavos < 0 ? "text-rausch" : "text-[var(--gray)]"}>
                  {isFinal || isFirst ? pesoCentavos(s.runningTotalCentavos) : s.deltaCentavos === 0 ? pesoCentavos(0) : `-${pesoCentavos(Math.abs(s.deltaCentavos))}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Three Profit Views + trend */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Profit & Margin — Three Views</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ProfitViewCard label="Accounting / Realized" desc="Cash-basis: revenue minus paid expenses only" profitCentavos={profitViews.accountingProfitCentavos} marginPct={profitViews.accountingMarginPct} />
          <ProfitViewCard label="Operating" desc="+ accrued payroll & booker commissions" profitCentavos={profitViews.operatingProfitCentavos} marginPct={profitViews.operatingMarginPct} highlight />
          <ProfitViewCard label="Economic" desc="+ this period's pending-but-incurred bills" profitCentavos={profitViews.economicProfitCentavos} marginPct={profitViews.economicMarginPct} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatBlock label="Revenue Growth" value={revenueGrowthPct !== null ? `${revenueGrowthPct >= 0 ? "+" : ""}${revenueGrowthPct}%` : "—"} tone={revenueGrowthPct === null ? "neutral" : revenueGrowthPct >= 0 ? "good" : "bad"} sub="vs last month" />
          <StatBlock label="Expense Growth" value={expenseGrowthPct !== null ? `${expenseGrowthPct >= 0 ? "+" : ""}${expenseGrowthPct}%` : "—"} tone={expenseGrowthPct === null ? "neutral" : expenseGrowthPct <= (revenueGrowthPct ?? 0) ? "good" : "bad"} sub="vs last month" />
          <StatBlock label="Margin Trend" value={marginTrendPct !== null ? `${marginTrendPct >= 0 ? "+" : ""}${marginTrendPct} pts` : "—"} tone={marginTrendPct === null ? "neutral" : marginTrendPct >= 0 ? "good" : "bad"} sub="operating margin, vs last month" />
        </div>
        {revenueGrowthPct !== null && expenseGrowthPct !== null && expenseGrowthPct > revenueGrowthPct && (
          <p className="mt-2 text-[12.5px] font-bold text-rausch">🔴 Margin compression — expenses (+{expenseGrowthPct}%) are growing faster than revenue (+{revenueGrowthPct}%).</p>
        )}
      </div>

      {/* Break-Even Analysis */}
      <div className="card p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Break-Even Analysis</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatBlock label="Break-Even Revenue" value={pesoCentavos(breakEven.breakEvenRevenueCentavos)} sub={`${breakEven.contributionMarginPct}% contribution margin`} />
          <StatBlock label="Break-Even Bookings" value={String(breakEven.breakEvenBookings)} />
          <StatBlock label="Break-Even Occupancy" value={`${breakEven.breakEvenOccupancyPct}%`} />
          <StatBlock label="Break-Even ADR" value={peso(breakEven.breakEvenAdrCentavos / 100)} sub="current ADR, for reference" />
          <StatBlock label="Break-Even / Unit" value={pesoCentavos(breakEven.breakEvenRevenuePerUnitCentavos)} />
        </div>
      </div>

      {/* Contribution Margin by Stay Type */}
      {contributionByStayType.length > 0 && (
        <div className="card overflow-x-auto p-4">
          <h4 className="mb-3 text-[13.5px] font-extrabold">Contribution Margin by Stay Type</h4>
          <table className="w-full min-w-[480px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
                <th className="py-1.5 pr-3">Stay Type</th><th className="px-3 py-1.5">Bookings</th><th className="px-3 py-1.5">Gross</th><th className="px-3 py-1.5">Contribution</th><th className="px-3 py-1.5">Margin</th>
              </tr>
            </thead>
            <tbody>
              {contributionByStayType.map((r) => (
                <tr key={r.key} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-1.5 pr-3 font-bold">{r.label}</td>
                  <td className="px-3 py-1.5">{r.bookings}</td>
                  <td className="px-3 py-1.5">{pesoCentavos(r.grossCentavos)}</td>
                  <td className="px-3 py-1.5 font-bold">{pesoCentavos(r.contributionCentavos)}</td>
                  <td className="px-3 py-1.5">{r.contributionMarginPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unit Economics */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Unit Economics</h4>
        <table className="w-full min-w-[720px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Unit</th><th className="px-3 py-1.5">Revenue</th><th className="px-3 py-1.5">Occupancy</th><th className="px-3 py-1.5">Fully-Loaded Profit</th><th className="px-3 py-1.5">Margin</th><th className="px-3 py-1.5">Profit/Night</th><th className="px-3 py-1.5">Break-Even Occ.</th>
            </tr>
          </thead>
          <tbody>
            {[...unitEconomics].sort((a, b) => b.fullyLoadedProfitCentavos - a.fullyLoadedProfitCentavos).map((u, i, arr) => (
              <tr key={u.unitId} className="border-b border-[var(--line)] last:border-0">
                <td className="py-1.5 pr-3 font-bold">
                  {formatUnitDisplay(u.unitNumber, u.name)}
                  {i === 0 && <span className="ml-1.5 rounded-full bg-teal/10 px-1.5 py-0.5 text-[10.5px] font-extrabold text-teal">Most Profitable</span>}
                  {i === arr.length - 1 && arr.length > 1 && <span className="ml-1.5 rounded-full bg-rausch/10 px-1.5 py-0.5 text-[10.5px] font-extrabold text-rausch">Needs Attention</span>}
                </td>
                <td className="px-3 py-1.5">{pesoCentavos(u.revenueCentavos)}</td>
                <td className="px-3 py-1.5">{u.occupancyPct}%</td>
                <td className="px-3 py-1.5 font-bold">{pesoCentavos(u.fullyLoadedProfitCentavos)}</td>
                <td className={`px-3 py-1.5 ${u.fullyLoadedMarginPct < 5 ? "font-bold text-rausch" : ""}`}>{u.fullyLoadedMarginPct}%</td>
                <td className="px-3 py-1.5">{pesoCentavos(u.profitPerOccupiedNightCentavos)}</td>
                <td className="px-3 py-1.5">{u.breakEvenOccupancyPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-[var(--gray)]">Fully-loaded profit = revenue − this unit&apos;s own direct expenses − an equal share of portfolio-wide fixed/payroll/marketing/operational costs.</p>
      </div>

      {/* Booker Profitability */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Booker Profitability — Who Is Winning and Who Is Losing</h4>
        <p className="mb-2 text-[11.5px] text-[var(--gray)]">Ranked by NET profit (after commission), not booking volume.</p>
        <table className="w-full min-w-[680px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Booker</th><th className="px-3 py-1.5">Bookings</th><th className="px-3 py-1.5">Gross Revenue</th><th className="px-3 py-1.5">Commission</th><th className="px-3 py-1.5">Net Profit</th><th className="px-3 py-1.5">Profit/Booking</th><th className="px-3 py-1.5">Cancel Rate</th>
            </tr>
          </thead>
          <tbody>
            {bookerProfitability.map((b) => (
              <tr key={b.employeeId} className="border-b border-[var(--line)] last:border-0">
                <td className="py-1.5 pr-3 font-bold">
                  {b.name}
                  {b.volumeVsProfitFlag === "high_volume_low_profit" && <span className="ml-1.5 rounded-full bg-amber/10 px-1.5 py-0.5 text-[10.5px] font-extrabold text-amber">High volume, low profit</span>}
                </td>
                <td className="px-3 py-1.5">{b.bookings}</td>
                <td className="px-3 py-1.5">{pesoCentavos(b.grossRevenueCentavos)}</td>
                <td className="px-3 py-1.5 text-[var(--gray)]">-{pesoCentavos(b.commissionCentavos)}</td>
                <td className="px-3 py-1.5 font-bold">{pesoCentavos(b.netProfitCentavos)}</td>
                <td className="px-3 py-1.5">{pesoCentavos(b.profitPerBookingCentavos)}</td>
                <td className="px-3 py-1.5">{b.cancellationRatePct}%</td>
              </tr>
            ))}
            {bookerProfitability.length === 0 && <tr><td colSpan={7} className="py-3 text-center text-[var(--gray)]">No active bookers.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Booking Source Profitability */}
      <div className="card overflow-x-auto p-4">
        <h4 className="mb-3 text-[13.5px] font-extrabold">Booking Source Profitability</h4>
        <p className="mb-2 text-[11.5px] text-[var(--gray)]">Gross-only — no real per-booking platform-fee data exists for any source. Revenue rank and profit rank can diverge.</p>
        <table className="w-full min-w-[520px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-1.5 pr-3">Source</th><th className="px-3 py-1.5">Bookings</th><th className="px-3 py-1.5">Revenue</th><th className="px-3 py-1.5">Contribution</th><th className="px-3 py-1.5">Margin</th><th className="px-3 py-1.5">Rev Rank</th><th className="px-3 py-1.5">Profit Rank</th>
            </tr>
          </thead>
          <tbody>
            {sourceProfitability.map((s) => (
              <tr key={s.source} className="border-b border-[var(--line)] last:border-0">
                <td className="py-1.5 pr-3 font-bold">{s.source}</td>
                <td className="px-3 py-1.5">{s.bookings}</td>
                <td className="px-3 py-1.5">{pesoCentavos(s.grossRevenueCentavos)}</td>
                <td className="px-3 py-1.5 font-bold">{pesoCentavos(s.contributionCentavos)}</td>
                <td className="px-3 py-1.5">{s.contributionMarginPct}%</td>
                <td className="px-3 py-1.5">#{s.revenueRank}</td>
                <td className={`px-3 py-1.5 ${s.profitRank > s.revenueRank ? "font-bold text-amber" : ""}`}>#{s.profitRank}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-[var(--gray)]">Top source by revenue share: {topSourceRevenueSharePct}% · Discounts given: {discountToGrossPct}% of gross</p>
      </div>

      {/* If Nothing Changes */}
      <div className="card p-4">
        <h4 className="mb-1 text-[13.5px] font-extrabold">If We Continue Doing Exactly What We&apos;re Doing</h4>
        <p className="mb-3 text-[12.5px] text-[var(--gray)]">A straight extrapolation of this month&apos;s own realized daily pace — not a second forecast model.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {statusQuoProjection.map((p) => (
            <div key={p.months} className="rounded-xl border border-[var(--line)] p-3">
              <div className="text-[11.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{p.months} Month{p.months > 1 ? "s" : ""}</div>
              <div className="mt-1 text-[17px] font-extrabold">{peso(p.profitCentavos / 100)}</div>
              <div className="text-[11.5px] font-semibold text-[var(--gray)]">profit · {p.marginPct}% margin</div>
            </div>
          ))}
        </div>
      </div>

      {/* What-If Simulator */}
      <WhatIfSimulator baseline={simulatorBaseline} />

      {/* Brutal Truth */}
      {brutalTruths.length > 0 && (
        <div className="card border border-[var(--line)] p-4">
          <h4 className="mb-3 text-[13.5px] font-extrabold">🔥 Brutal Truth</h4>
          <div className="space-y-2.5">
            {brutalTruths.map((t, i) => (
              <p key={i} className="text-[13px] font-medium leading-relaxed">{t.statement}</p>
            ))}
          </div>
        </div>
      )}

      {/* Top 5 Money-Making Actions */}
      {topActions.length > 0 && (
        <div className="card p-4">
          <h4 className="mb-3 text-[13.5px] font-extrabold">Top {topActions.length} Action{topActions.length === 1 ? "" : "s"} That Will Make You More Money</h4>
          <div className="space-y-3">
            {topActions.map((a, i) => (
              <div key={i} className="rounded-xl border border-[var(--line)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-extrabold">{i + 1}. {a.title}</span>
                  <span className="text-[14px] font-extrabold text-teal">+{peso(a.estimatedMonthlyImpactCentavos / 100)}/month</span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--gray)]"><span className="font-bold text-[var(--ink)]">Problem: </span>{a.problem}</p>
                <p className="mt-0.5 text-[12px] text-[var(--gray)]"><span className="font-bold text-[var(--ink)]">Evidence: </span>{a.evidence}</p>
                <p className="mt-0.5 text-[12px] text-[var(--gray)]"><span className="font-bold text-[var(--ink)]">Action: </span>{a.recommendedAction}</p>
                <div className="mt-1.5 flex gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${DIFFICULTY_STYLE[a.difficulty]}`}>{a.difficulty} effort</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${RISK_STYLE[a.risk]}`}>{a.risk} risk</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted, bold, small }: { label: string; value: string; muted?: boolean; bold?: boolean; small?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 border-b border-[var(--line)] py-1 last:border-0 ${small ? "text-[11.5px]" : "text-[12.5px]"}`}>
      <span className={muted ? "text-[var(--gray)]" : ""}>{label}</span>
      <span className={bold ? "font-extrabold" : muted ? "text-[var(--gray)]" : "font-semibold"}>{value}</span>
    </div>
  );
}

function ProfitViewCard({ label, desc, profitCentavos, marginPct, highlight }: { label: string; desc: string; profitCentavos: number; marginPct: number; highlight?: boolean }) {
  const negative = profitCentavos < 0;
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-[var(--skin-primary,#6C5CE7)]/40 bg-[var(--skin-primary,#6C5CE7)]/5" : "border-[var(--line)]"}`}>
      <div className="text-[11.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className="text-[10.5px] text-[var(--gray)]">{desc}</div>
      <div className={`mt-2 text-[19px] font-extrabold tracking-tight ${negative ? "text-rausch" : ""}`}>{pesoCentavos(profitCentavos)}</div>
      <div className={`mt-0.5 text-[12px] font-bold ${negative ? "text-rausch" : "text-teal"}`}>{marginPct}% margin</div>
    </div>
  );
}
