import { unstable_cache } from "next/cache";
import { prismaPool } from "@/lib/prisma";
import { dashboardUnitIdWhere } from "@/lib/session";
import { resolveAnalyticsPeriod, periodRangeFor, type AnalyticsPeriodPreset } from "@/lib/analytics/period";
import { computeOccupancy, computeADR, computeRevPAR } from "@/lib/analytics/occupancy";
import { collectedRevenueCentavos, revenueGrowthPct } from "@/lib/analytics/revenue";
import { cancellationRate, avgStayLengthNights } from "@/lib/analytics/bookings";
import { guestRepeatRate } from "@/lib/analytics/guests";
import { trailingAverageForecast } from "@/lib/analytics/forecast";
import { netProfitCentavos, paidExpensesCentavos } from "@/lib/analytics/financials";

export type AnalyticsFilters = {
  preset: AnalyticsPeriodPreset;
  customStart?: string;
  customEnd?: string;
  unitIds?: string[] | null;
};

const kpiBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, stayType: true, amount: true, paid: true,
  dpAmount: true, cancelledAt: true, guestId: true, contactNumber: true,
} as const;

/**
 * The unit scope every Analytics query is filtered by: the caller's
 * portfolio (dashboardUnitIdWhere — same Co-owner/scoped-Owner rule
 * Dashboard uses) intersected with whatever the filter bar's Unit select
 * has chosen. Intersecting (not overriding) is what stops a scoped user
 * from ever seeing a unit outside their own portfolio just by picking it
 * in the filter bar. Returns null for "no restriction at all".
 */
function effectiveUnitIds(user: { role: string; ownedUnitIds: string[] }, filterUnitIds: string[] | null | undefined): string[] | null {
  const baseIdWhere = dashboardUnitIdWhere(user) as { id?: { in: string[] } };
  const basePortfolio = baseIdWhere.id?.in ?? null;
  if (!filterUnitIds || filterUnitIds.length === 0) return basePortfolio;
  if (!basePortfolio) return filterUnitIds;
  return basePortfolio.filter((id) => filterUnitIds.includes(id));
}

async function fetchKpiData(
  role: string,
  ownedUnitIds: string[],
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = effectiveUnitIds(user, filterUnitIds);
  const unitIdWhere = effective ? { id: { in: effective } } : {};
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const billUnitWhere = effective ? { unitId: { in: effective } } : {};

  const { current, previous } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  // Monthly Forecast is deliberately independent of the selected filter
  // period — it's always "based on the last few real calendar months",
  // regardless of whether the user is currently looking at Today or This
  // Year elsewhere on the page.
  const trailingMonths = [3, 2, 1].map((n) => periodRangeFor("monthly", -n));

  const [units, currentBookings, previousBookings, blocks, currentPaidBills, previousPaidBills, ...trailingMonthBookings] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true } }),
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: kpiBookingSelect }),
    prismaPool[2].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: previous.start, lt: previous.end } }, select: kpiBookingSelect }),
    prismaPool[3].calendarBlock.findMany({
      where: { ...bookingUnitWhere, type: { in: ["Maintenance", "Cleaning"] }, date: { lt: current.end }, OR: [{ endDate: null }, { endDate: { gt: current.start } }] },
      select: { unitId: true, type: true, date: true, endDate: true },
    }),
    prismaPool[4].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: current.start, lt: current.end } }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    prismaPool[5].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: previous.start, lt: previous.end } }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    ...trailingMonths.map((range, i) =>
      prismaPool[6 + i].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: range.start, lt: range.end } }, select: { amount: true, paid: true, dpAmount: true, cancelledAt: true } })
    ),
  ]);

  return JSON.parse(JSON.stringify({ units, currentBookings, previousBookings, blocks, currentPaidBills, previousPaidBills, trailingMonthBookings }));
}

const cachedFetchKpiData = unstable_cache(fetchKpiData, ["analytics-kpis"], { revalidate: 60 });

export type ExecutiveKPIs = {
  totalRevenueCentavos: number;
  netProfitCentavos: number;
  netProfitNote: string;
  occupancyPct: number;
  adrCentavos: number;
  revparCentavos: number;
  totalBookings: number;
  cancellationRatePct: number;
  avgStayLengthNights: number;
  repeatGuestRatePct: number;
  repeatGuestBasis: string;
  revenueGrowthPct: number | null;
  profitGrowthPct: number | null;
  monthlyForecastCentavos: number;
  forecastMethod: string;
  forecastConfidence: "low" | "medium";
  unitCount: number;
};

export async function getExecutiveKPIs(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<ExecutiveKPIs> {
  const data = await cachedFetchKpiData(
    user.role,
    user.ownedUnitIds,
    filters.preset,
    filters.customStart ?? "",
    filters.customEnd ?? "",
    (filters.unitIds ?? []).join(",")
  );
  const { units, currentBookings, previousBookings, blocks, currentPaidBills, previousPaidBills, trailingMonthBookings } = data;
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });
  const currentStart = new Date(current.start);
  const currentEnd = new Date(current.end);

  const totalRevenueCentavos = collectedRevenueCentavos(currentBookings);
  const previousRevenueCentavos = collectedRevenueCentavos(previousBookings);

  const currentPaidExpensesCents = paidExpensesCentavos(currentPaidBills);
  const previousPaidExpensesCents = paidExpensesCentavos(previousPaidBills);
  const netProfit = netProfitCentavos({ revenueCentavos: totalRevenueCentavos, paidExpensesCentavos: currentPaidExpensesCents });
  const previousNetProfit = netProfitCentavos({ revenueCentavos: previousRevenueCentavos, paidExpensesCentavos: previousPaidExpensesCents });

  const occ = computeOccupancy({
    unitCount: units.length,
    periodStart: currentStart,
    periodEnd: currentEnd,
    bookings: currentBookings,
    maintenanceBlocks: blocks.filter((b: any) => b.type === "Maintenance"),
    cleaningBlocks: blocks.filter((b: any) => b.type === "Cleaning"),
  });
  const adr = computeADR(currentBookings, currentStart, currentEnd);
  const revpar = computeRevPAR(totalRevenueCentavos, occ.availableNights);

  const repeat = guestRepeatRate(currentBookings);

  const monthlyTotals = trailingMonthBookings.map((rows: any[]) => collectedRevenueCentavos(rows));
  const forecast = trailingAverageForecast(monthlyTotals);

  return {
    totalRevenueCentavos,
    netProfitCentavos: netProfit,
    netProfitNote: "Revenue minus paid bills for this period. Doesn't include staff payroll yet — see Dashboard's Realized Profit for the fuller figure.",
    occupancyPct: occ.occupancyPct,
    adrCentavos: adr * 100,
    revparCentavos: revpar * 100,
    totalBookings: currentBookings.length,
    cancellationRatePct: cancellationRate(currentBookings),
    avgStayLengthNights: avgStayLengthNights(currentBookings),
    repeatGuestRatePct: repeat.repeatRatePct,
    repeatGuestBasis: repeat.basis,
    revenueGrowthPct: revenueGrowthPct(totalRevenueCentavos, previousRevenueCentavos),
    profitGrowthPct: revenueGrowthPct(netProfit, previousNetProfit),
    monthlyForecastCentavos: forecast.forecastCentavos,
    forecastMethod: forecast.method,
    forecastConfidence: forecast.confidence,
    unitCount: units.length,
  };
}
