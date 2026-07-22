import { computeOccupancy, computeADR, computeRevPAR, type OccupancyBooking, type OccupancyBlock } from "@/lib/analytics/occupancy";
import { collectedRevenueCentavos } from "@/lib/analytics/revenue";
import { netProfitCentavos, paidExpensesCentavosForUnit, type ExpenseLike } from "@/lib/analytics/financials";

export type UnitPerformanceRow = {
  unitId: string;
  name: string;
  occupancyPct: number;
  revenueCentavos: number;
  expensesCentavos: number;
  profitCentavos: number;
  bookingCount: number;
  rating: number;
  adrCentavos: number;
  revparCentavos: number;
};

/**
 * A pure composition of already-verified functions — Phase A's
 * computeOccupancy, revenue's collectedRevenueCentavos, and financials'
 * paidExpensesCentavosForUnit/netProfitCentavos — not new arithmetic. This
 * is the concrete proof-point for "no duplicate calculations": per-unit
 * figures come from filtering the exact same inputs the portfolio-level
 * KPIs use, not a second parallel formula.
 */
export function unitPerformance(
  units: { id: string; name: string; rating: number }[],
  bookings: (OccupancyBooking & { unitId: string })[],
  expenses: (ExpenseLike & { unitId: string | null })[],
  maintenanceBlocks: OccupancyBlock[],
  cleaningBlocks: OccupancyBlock[],
  periodStart: Date,
  periodEnd: Date
): UnitPerformanceRow[] {
  return units.map((unit) => {
    const unitBookings = bookings.filter((b) => b.unitId === unit.id);
    const unitMaintenance = maintenanceBlocks.filter((b) => b.unitId === unit.id);
    const unitCleaning = cleaningBlocks.filter((b) => b.unitId === unit.id);

    const occ = computeOccupancy({
      unitCount: 1,
      periodStart,
      periodEnd,
      bookings: unitBookings,
      maintenanceBlocks: unitMaintenance,
      cleaningBlocks: unitCleaning,
    });
    const revenueCentavos = collectedRevenueCentavos(unitBookings);
    const expensesCentavos = paidExpensesCentavosForUnit(expenses, unit.id);
    const profitCentavos = netProfitCentavos({ revenueCentavos, paidExpensesCentavos: expensesCentavos });
    const bookingCount = unitBookings.filter((b) => !b.cancelledAt).length;
    const adr = computeADR(unitBookings, periodStart, periodEnd);
    const revpar = computeRevPAR(revenueCentavos, occ.availableNights);

    return {
      unitId: unit.id,
      name: unit.name,
      occupancyPct: occ.occupancyPct,
      revenueCentavos,
      expensesCentavos,
      profitCentavos,
      bookingCount,
      rating: unit.rating,
      adrCentavos: adr * 100,
      revparCentavos: revpar * 100,
    };
  });
}

export function bestWorstUnits(rows: UnitPerformanceRow[], metric: "revenueCentavos" | "occupancyPct" | "profitCentavos"): { best: UnitPerformanceRow | null; worst: UnitPerformanceRow | null } {
  if (rows.length === 0) return { best: null, worst: null };
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}
