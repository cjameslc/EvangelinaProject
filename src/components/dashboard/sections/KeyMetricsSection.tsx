import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { peso } from "@/lib/format";
import { useKeyMetricsInsight } from "../hooks/useKeyMetricsInsight";
import type { Booking } from "../types";
import type { OccupancyBlock } from "@/lib/analytics/occupancy";

export function KeyMetricsSection({
  netProfit,
  netProfitRaw,
  forecastProfit,
  margin,
  marginRaw,
  cashFlow,
  cashFlowRaw,
  // Read-only derived slice of the Earnings period filter — this card never
  // mutates the filter, so it never receives the setters.
  filteredOccupancy,
  filteredRevpar,
  filteredAdr,
  filteredUnitCount,
  periodPhrase,
  periodPhraseCap,
  // useKeyMetricsInsight inputs.
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
  netProfit: number;
  netProfitRaw: number;
  forecastProfit: number;
  margin: number;
  marginRaw: number;
  cashFlow: number;
  cashFlowRaw: number;
  filteredOccupancy: number;
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
  units: { id: string }[];
  weekRangeStart: string;
  weekRangeEnd: string;
  bookingsWeek: Booking[];
  calendarBlocksOccupancy: OccupancyBlock[];
}) {
  const { keyMetricsInsights, aiInsight } = useKeyMetricsInsight({
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
  });

  return (
    <Accordion title="Key metrics">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {/* Red is reserved for things that actually need action (overdue
            bills, low stock, open findings — see "Needs your attention"
            below). A dip in a routine metric like these gets amber, a
            softer "worth a look," not an alarm. Occupancy/RevPAR/ADR
            can't mathematically go negative, so they never get either. */}
        <StatCard
          label="Realized profit" value={peso(netProfit)} sub="completed stays, paid costs only" warn={netProfitRaw < 0} tone="caution"
          info="Completed-stay revenue minus paid bills, expenses, and payroll accrued so far. Floors at ₱0."
        />
        <StatCard
          label="Forecast profit" value={peso(forecastProfit)} sub="if fully collected/paid" projected
          info="Every booking's full value minus outstanding bills and unaccrued payroll. A projection, not cash in hand."
        />
        <StatCard
          label="Profit margin" value={`${margin}%`} sub="realized income kept as profit" warn={marginRaw < 0} tone="caution"
          info="Realized profit as a percent of completed-stay revenue. Floors at 0%."
        />
        <StatCard
          label="Cash flow" value={peso(cashFlow)} sub="collected − paid − accrued payroll" warn={cashFlowRaw < 0} tone="caution"
          info="Everything collected this month minus paid bills, expenses, and payroll accrued so far. Floors at ₱0."
        />
        <StatCard label="Occupancy" value={`${filteredOccupancy}%`} sub={`across ${filteredUnitCount} unit${filteredUnitCount !== 1 ? "s" : ""}`} info={`Booked nights ${periodPhrase} ÷ total available nights.`} />
        <StatCard label="RevPAR" value={peso(filteredRevpar)} sub="revenue per available room" info={`${periodPhraseCap}'s income ÷ available room-nights.`} infoAlign="right" />
        <StatCard label="Nightly rate (ADR)" value={peso(filteredAdr)} sub="revenue ÷ occupied nights" info={`${periodPhraseCap}'s booked revenue ÷ actual nights stayed.`} infoAlign="right" />
      </div>
      {(aiInsight || keyMetricsInsights.length > 0) && (
        <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3.5">
          <p className="text-[12.5px] leading-relaxed text-[var(--gray)]">{aiInsight ?? keyMetricsInsights.join(" ")}</p>
        </div>
      )}
    </Accordion>
  );
}
