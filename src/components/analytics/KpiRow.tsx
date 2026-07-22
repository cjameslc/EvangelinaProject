import { StatCard } from "@/components/ui/StatCard";
import { NoDataSourceCard } from "@/components/analytics/NoDataSourceCard";
import { peso, pesoCentavos } from "@/lib/format";
import type { ExecutiveKPIs } from "@/app/analytics/queries";

function growthSub(pct: number | null, noun: string) {
  if (pct === null) return `no prior period to compare`;
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs previous ${noun}`;
}

export function KpiRow({ kpis }: { kpis: ExecutiveKPIs }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatCard
        label="Total Revenue" value={pesoCentavos(kpis.totalRevenueCentavos)} sub={growthSub(kpis.revenueGrowthPct, "period")}
        info="Collected + downpayments on file for the selected period, excluding cancelled bookings."
      />
      <StatCard
        label="Net Profit" value={pesoCentavos(kpis.netProfitCentavos)} warn={kpis.netProfitCentavos < 0} tone="caution"
        sub={growthSub(kpis.profitGrowthPct, "period")} info={kpis.netProfitNote}
      />
      <StatCard label="Occupancy Rate" value={`${kpis.occupancyPct}%`} sub={`across ${kpis.unitCount} unit${kpis.unitCount === 1 ? "" : "s"}`} info="Real occupied nights ÷ available room-nights (Maintenance-blocked nights excluded)." />
      <StatCard label="ADR" value={peso(Math.round(kpis.adrCentavos / 100))} sub="revenue ÷ occupied nights" info="Average Daily Rate — this period's revenue divided by actual nights stayed." infoAlign="right" />
      <StatCard label="RevPAR" value={peso(Math.round(kpis.revparCentavos / 100))} sub="revenue per available room" info="This period's revenue ÷ available room-nights." infoAlign="right" />
      <StatCard label="Total Bookings" value={kpis.totalBookings} sub="including cancelled" info="Every booking whose check-in falls in the selected period." />
      <StatCard label="Cancellation Rate" value={`${kpis.cancellationRatePct}%`} warn={kpis.cancellationRatePct > 20} tone="caution" info="% of this period's bookings that were cancelled." />
      <StatCard label="Avg Stay Length" value={`${kpis.avgStayLengthNights}n`} sub="per booking" info="Average real nights per non-cancelled stay." />
      <StatCard
        label="Repeat Guest Rate" value={`${kpis.repeatGuestRatePct}%`}
        sub="Guest Portal accounts + phone match" info="Best-effort — combines Guest Portal accounts with a same-phone-number heuristic across all bookings. Not exact identity."
      />
      <StatCard
        label="Monthly Forecast" value={pesoCentavos(kpis.monthlyForecastCentavos)} projected
        sub={`${kpis.forecastMethod} · ${kpis.forecastConfidence} confidence`} info="An estimate from recent months' actuals, not a guarantee." infoAlign="right"
      />
      <NoDataSourceCard label="Customer Satisfaction" reason="This app doesn't collect guest satisfaction scores yet." />
    </div>
  );
}
