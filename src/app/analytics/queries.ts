import { unstable_cache } from "next/cache";
import { prismaPool } from "@/lib/prisma";
import { dashboardUnitIdWhere } from "@/lib/session";
import { resolveAnalyticsPeriod, periodRangeFor, daysInRange, type AnalyticsPeriodPreset } from "@/lib/analytics/period";
import { computeOccupancy, computeADR, computeRevPAR, occupancyCalendarGrid, OCCUPANCY_CALENDAR_MAX_DAYS, type CalendarCell } from "@/lib/analytics/occupancy";
import { collectedRevenueCentavos, revenueGrowthPct, revenueSeries, revenueByDimension, type RevenuePoint, type RevenueDimensionRow } from "@/lib/analytics/revenue";
import { cancellationRate, avgStayLengthNights, bookingFunnel, leadTimeDistribution, peakDayCounts } from "@/lib/analytics/bookings";
import { guestRepeatRate, guestLifetimeValue, topGuests as topGuestsFn, frequentGuests as frequentGuestsFn, avgGuestsPerBooking } from "@/lib/analytics/guests";
import { trailingAverageForecast } from "@/lib/analytics/forecast";
import { netProfitCentavos, paidExpensesCentavos, cashFlowCentavos, pendingExpensesCentavos, outstandingBalanceCentavos } from "@/lib/analytics/financials";
import { cleaningStats, cleanerPerformance, delayedCleanings, roomsReadySnapshot } from "@/lib/analytics/housekeeping";
import { staffPerformance } from "@/lib/analytics/staff";
import type { PayrollRates } from "@/lib/payroll";
import { unitPerformance, bestWorstUnits, type UnitPerformanceRow } from "@/lib/analytics/units";
import { formatUnitDisplay } from "@/lib/format";

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

/** day for short periods, week for a quarter, month for a year+ — keeps a trend chart from either showing one bar (a year bucketed by day) or a flat line (a day bucketed by month). */
function granularityForPeriod(start: Date, end: Date): "day" | "week" | "month" {
  const days = daysInRange({ start, end });
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

const revenueBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, platform: true, stayType: true, method: true,
} as const;

async function fetchRevenueData(
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

  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const [units, bookings] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true, shortName: true } }),
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: revenueBookingSelect }),
  ]);

  return JSON.parse(JSON.stringify({ units, bookings }));
}

const cachedFetchRevenueData = unstable_cache(fetchRevenueData, ["analytics-revenue"], { revalidate: 60 });

export type DrillDownBooking = { id: string; date: string; checkOutDate: string | null; unitLabel: string; stayType: string; amount: number; paid: boolean };

export type RevenueAnalytics = {
  series: RevenuePoint[];
  granularity: "day" | "week" | "month";
  byUnit: RevenueDimensionRow[];
  bySource: RevenueDimensionRow[];
  byStayType: RevenueDimensionRow[];
  byPaymentMethod: RevenueDimensionRow[];
  // Small (one-period) raw list, just for the trend chart's drill-down —
  // clicking a bucket shows the bookings behind it without a second
  // round-trip or a separate page.
  bookings: DrillDownBooking[];
};

export async function getRevenueAnalytics(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<RevenueAnalytics> {
  const data = await cachedFetchRevenueData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { units, bookings } = data;
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });
  const granularity = granularityForPeriod(new Date(current.start), new Date(current.end));
  const unitLabels = Object.fromEntries(units.map((u: any) => [u.id, u.shortName]));

  return {
    series: revenueSeries(bookings, granularity, current.start, current.end),
    granularity,
    byUnit: revenueByDimension(bookings, "unit", unitLabels),
    bySource: revenueByDimension(bookings, "source"),
    byStayType: revenueByDimension(bookings, "stayType"),
    byPaymentMethod: revenueByDimension(bookings, "paymentMethod"),
    bookings: bookings
      .filter((b: any) => !b.cancelledAt)
      .map((b: any) => ({ id: b.id, date: b.date, checkOutDate: b.checkOutDate, unitLabel: unitLabels[b.unitId] ?? b.unitId, stayType: b.stayType, amount: b.amount, paid: b.paid })),
  };
}

async function fetchFinancialData(
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
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const billUnitWhere = effective ? { unitId: { in: effective } } : {};

  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const [bookings, paidBills, pendingBills] = await Promise.all([
    prismaPool[0].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: { amount: true, paid: true, dpAmount: true, cancelledAt: true } }),
    prismaPool[1].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: current.start, lt: current.end } }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    // Pending bills are a "right now" figure, not period-scoped — an unpaid
    // bill doesn't really belong to "last quarter" in a meaningful sense
    // once that quarter's ensureRecurringBillsForMonth cycle has already
    // regenerated the next one. Scoping this to the selected period would
    // require guessing which Bill.month buckets the period covers, a
    // shakier heuristic than just showing what's actually outstanding now.
    prismaPool[2].bill.findMany({ where: { ...billUnitWhere, paid: false }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true, paid: true } }),
  ]);

  return JSON.parse(JSON.stringify({ bookings, paidBills, pendingBills }));
}

const cachedFetchFinancialData = unstable_cache(fetchFinancialData, ["analytics-financial"], { revalidate: 60 });

export type FinancialAnalytics = {
  grossRevenueCentavos: number;
  netRevenueCentavos: number;
  paidExpensesCentavos: number;
  pendingExpensesCentavos: number;
  cashFlowCentavos: number;
  outstandingBalanceCentavos: number;
};

export async function getFinancialAnalytics(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<FinancialAnalytics> {
  const data = await cachedFetchFinancialData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { bookings, paidBills, pendingBills } = data;

  const grossRevenueCentavos = bookings.reduce((s: number, b: any) => (b.cancelledAt ? s : s + b.amount * 100), 0);
  const netRevenueCentavos = collectedRevenueCentavos(bookings);
  const paidExpensesCents = paidExpensesCentavos(paidBills);
  const pendingExpensesCents = pendingExpensesCentavos(pendingBills);
  const cashFlow = cashFlowCentavos({ revenueCentavos: netRevenueCentavos, paidExpensesCentavos: paidExpensesCents });
  const outstanding = outstandingBalanceCentavos(bookings);

  return {
    grossRevenueCentavos,
    netRevenueCentavos,
    paidExpensesCentavos: paidExpensesCents,
    pendingExpensesCentavos: pendingExpensesCents,
    cashFlowCentavos: cashFlow,
    outstandingBalanceCentavos: outstanding,
  };
}

const bookingAnalyticsSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, stayType: true, paid: true, dpAmount: true,
  checkedInAt: true, checkedOutAt: true, cancelledAt: true, createdAt: true,
} as const;

async function fetchBookingData(
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
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const bookings = await prismaPool[0].booking.findMany({
    where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } },
    select: bookingAnalyticsSelect,
  });
  return JSON.parse(JSON.stringify({ bookings }));
}

const cachedFetchBookingData = unstable_cache(fetchBookingData, ["analytics-bookings"], { revalidate: 60 });

export type BookingAnalytics = {
  funnel: { stage: string; count: number }[];
  leadTime: { bucket: string; count: number }[];
  peakBookingDays: { dow: string; count: number }[];
  peakCheckInDays: { dow: string; count: number }[];
  peakCheckOutDays: { dow: string; count: number }[];
};

export async function getBookingAnalytics(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<BookingAnalytics> {
  const data = await cachedFetchBookingData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { bookings } = data;
  return {
    funnel: bookingFunnel(bookings),
    leadTime: leadTimeDistribution(bookings).map((r) => ({ bucket: r.bucket, count: r.count })),
    peakBookingDays: peakDayCounts(bookings, "booked"),
    peakCheckInDays: peakDayCounts(bookings, "checkIn"),
    peakCheckOutDays: peakDayCounts(bookings, "checkOut"),
  };
}

const occupancyBookingSelect = {
  unitId: true, stayType: true, date: true, checkOutDate: true, amount: true, paid: true, dpAmount: true, cancelledAt: true,
} as const;

async function fetchOccupancyData(
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

  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });
  // Calendar grid is capped independently of the KPI period — a year-long
  // grid would be unreadable (see OCCUPANCY_CALENDAR_MAX_DAYS), so it
  // always shows at most the last N days of whatever period is selected.
  const calendarDays = Math.min(daysInRange(current), OCCUPANCY_CALENDAR_MAX_DAYS);
  const calendarStart = new Date(current.end.getTime() - calendarDays * 86400000);

  const trailingMonths = [3, 2, 1].map((n) => periodRangeFor("monthly", -n));

  const [units, bookings, blocks, ...trailingMonthData] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true, shortName: true } }),
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: occupancyBookingSelect }),
    prismaPool[2].calendarBlock.findMany({
      where: { ...bookingUnitWhere, type: { in: ["Maintenance", "Cleaning"] }, date: { lt: current.end }, OR: [{ endDate: null }, { endDate: { gt: current.start } }] },
      select: { unitId: true, type: true, date: true, endDate: true },
    }),
    ...trailingMonths.map(async (range, i) => {
      const [tBookings, tBlocks] = await Promise.all([
        prismaPool[3 + i].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: range.start, lt: range.end } }, select: occupancyBookingSelect }),
        prismaPool[6 + i].calendarBlock.findMany({
          where: { ...bookingUnitWhere, type: "Maintenance", date: { lt: range.end }, OR: [{ endDate: null }, { endDate: { gt: range.start } }] },
          select: { unitId: true, type: true, date: true, endDate: true },
        }),
      ]);
      return { bookings: tBookings, maintenanceBlocks: tBlocks, start: range.start, end: range.end };
    }),
  ]);

  return JSON.parse(JSON.stringify({ units, bookings, blocks, calendarStart, calendarEnd: current.end, trailingMonthData }));
}

const cachedFetchOccupancyData = unstable_cache(fetchOccupancyData, ["analytics-occupancy"], { revalidate: 60 });

export type OccupancyAnalytics = {
  occupancyPct: number;
  occupiedNights: number;
  availableNights: number;
  maintenanceNights: number;
  cleaningNights: number;
  calendarUnits: { id: string; label: string }[];
  calendarDays: string[];
  calendarCells: CalendarCell[];
  calendarTruncated: boolean;
  forecastPct: number;
  forecastMethod: string;
  forecastConfidence: "low" | "medium";
};

export async function getOccupancyAnalytics(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<OccupancyAnalytics> {
  const data = await cachedFetchOccupancyData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { units, bookings, blocks, calendarStart, calendarEnd, trailingMonthData } = data;
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });
  const currentStart = new Date(current.start);
  const currentEnd = new Date(current.end);

  const maintenanceBlocks = blocks.filter((b: any) => b.type === "Maintenance");
  const cleaningBlocks = blocks.filter((b: any) => b.type === "Cleaning");

  const occ = computeOccupancy({
    unitCount: units.length,
    periodStart: currentStart,
    periodEnd: currentEnd,
    bookings,
    maintenanceBlocks,
    cleaningBlocks,
  });

  const gridStart = new Date(calendarStart);
  const gridEnd = new Date(calendarEnd);
  const cells = occupancyCalendarGrid({
    unitIds: units.map((u: any) => u.id),
    periodStart: gridStart,
    periodEnd: gridEnd,
    bookings,
    maintenanceBlocks,
    cleaningBlocks,
  });
  const gridDays = daysInRange({ start: gridStart, end: gridEnd });
  const calendarDayKeys = Array.from({ length: gridDays }, (_, i) => new Date(gridStart.getTime() + i * 86400000).toISOString().slice(0, 10));

  const monthlyOccPcts = trailingMonthData.map((m: any) =>
    computeOccupancy({
      unitCount: units.length,
      periodStart: new Date(m.start),
      periodEnd: new Date(m.end),
      bookings: m.bookings,
      maintenanceBlocks: m.maintenanceBlocks,
      cleaningBlocks: [],
    }).occupancyPct
  );
  const forecast = trailingAverageForecast(monthlyOccPcts);

  return {
    occupancyPct: occ.occupancyPct,
    occupiedNights: occ.occupiedNights,
    availableNights: occ.availableNights,
    maintenanceNights: occ.maintenanceNights,
    cleaningNights: occ.cleaningNights,
    calendarUnits: units.map((u: any) => ({ id: u.id, label: u.shortName })),
    calendarDays: calendarDayKeys,
    calendarCells: cells,
    calendarTruncated: daysInRange(current) > OCCUPANCY_CALENDAR_MAX_DAYS,
    forecastPct: forecast.forecastCentavos, // reusing the generic forecaster for a plain percentage, not centavos, despite the field name
    forecastMethod: forecast.method,
    forecastConfidence: forecast.confidence,
  };
}

async function fetchGuestData(
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
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const guestSelect = { guestId: true, contactNumber: true, guests: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, pax: true } as const;
  const [periodBookings, allTimeBookings] = await Promise.all([
    prismaPool[0].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: guestSelect }),
    // Lifetime Value is, by definition, not scoped to the selected period —
    // this is the one Analytics query that deliberately ignores the filter
    // bar's period (still respects the Unit filter).
    prismaPool[1].booking.findMany({ where: bookingUnitWhere, select: guestSelect }),
  ]);
  return JSON.parse(JSON.stringify({ periodBookings, allTimeBookings }));
}

const cachedFetchGuestData = unstable_cache(fetchGuestData, ["analytics-guests"], { revalidate: 60 });

export type GuestAnalytics = {
  repeatRatePct: number;
  newGuestCount: number;
  returningGuestCount: number;
  avgGuestsPerBooking: number;
  topGuests: { key: string; name: string; totalCentavos: number; bookingCount: number }[];
  frequentGuests: { key: string; name: string; totalCentavos: number; bookingCount: number }[];
};

export async function getGuestAnalytics(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<GuestAnalytics> {
  const data = await cachedFetchGuestData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { periodBookings, allTimeBookings } = data;
  const repeat = guestRepeatRate(periodBookings);
  return {
    repeatRatePct: repeat.repeatRatePct,
    newGuestCount: repeat.newGuestCount,
    returningGuestCount: repeat.returningGuestCount,
    avgGuestsPerBooking: avgGuestsPerBooking(periodBookings),
    topGuests: topGuestsFn(allTimeBookings, 5),
    frequentGuests: frequentGuestsFn(allTimeBookings, 5),
  };
}

async function fetchHousekeepingData(
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
  const where = effective ? { unitId: { in: effective } } : {};
  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const unitIdWhere = effective ? { id: { in: effective } } : {};
  const [logs, states, employees, units] = await Promise.all([
    prismaPool[0].cleaningLog.findMany({ where: { ...where, startedAt: { gte: current.start, lt: current.end } }, select: { unitId: true, employeeId: true, startedAt: true, endedAt: true } }),
    // Room-readiness is a "right now" snapshot, not period-scoped — same
    // reasoning as Financial's Pending Expenses.
    prismaPool[1].housekeepingUnitState.findMany({ where, select: { unitId: true, status: true, startedAt: true } }),
    // Not filtered to role="HOUSEKEEPING" — a CleaningLog can be attributed
    // to anyone who actually performed the clean (e.g. an Owner covering a
    // quick clean themselves), and excluding them from this lookup would
    // show their name as "Unknown" instead of who it actually was.
    prismaPool[2].employee.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prismaPool[3].unit.findMany({ where: unitIdWhere, select: { id: true, shortName: true, unitNumber: true } }),
  ]);
  return JSON.parse(JSON.stringify({ logs, states, employees, units }));
}

const cachedFetchHousekeepingData = unstable_cache(fetchHousekeepingData, ["analytics-housekeeping"], { revalidate: 60 });

export type HousekeepingAnalytics = {
  completed: number;
  pending: number;
  avgDurationMinutes: number;
  roomsReady: number;
  roomsCleaning: number;
  roomsTodo: number;
  delayed: { unitId: string; minutesElapsed: number }[];
  cleanerPerformance: { employeeId: string; name: string; completedCount: number; avgDurationMinutes: number }[];
};

export async function getHousekeepingAnalytics(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<HousekeepingAnalytics> {
  const data = await cachedFetchHousekeepingData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { logs, states, employees, units } = data;
  const unitLabels = Object.fromEntries(units.map((u: any) => [u.id, formatUnitDisplay(u.unitNumber, u.shortName)]));
  const stats = cleaningStats(logs);
  const rooms = roomsReadySnapshot(states);
  return {
    completed: stats.completed,
    pending: stats.pending,
    avgDurationMinutes: stats.avgDurationMinutes,
    roomsReady: rooms.clean,
    roomsCleaning: rooms.cleaning,
    roomsTodo: rooms.todo,
    delayed: delayedCleanings(states, 90).map((d) => ({ unitId: unitLabels[d.unitId] ?? d.unitId, minutesElapsed: d.minutesElapsed })),
    cleanerPerformance: cleanerPerformance(logs, employees),
  };
}

async function fetchStaffData(
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
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const [bookings, cleaningLogs, expenses, employees, settings] = await Promise.all([
    // No cancelledAt filter — a cancelled booking can still be
    // commission-eligible (see isCommissionEligible in bookingStatus.ts:
    // paid, or a cancelled booking whose deposit wasn't refunded), so it has
    // to reach computeTeamBreakdown/staffPerformance rather than being
    // excluded at the source. dpAmount + refundedAt selected because
    // isCommissionEligible needs both.
    prismaPool[0].booking.findMany({
      where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } },
      select: { id: true, bookerId: true, cleanerId: true, unitId: true, stayType: true, date: true, checkOutDate: true, checkOutTime: true, paid: true, cancelledAt: true, dpAmount: true, refundedAt: true },
    }),
    prismaPool[1].cleaningLog.findMany({ where: { startedAt: { gte: current.start, lt: current.end } }, select: { employeeId: true, startedAt: true } }),
    prismaPool[2].weeklyExpense.findMany({ where: { date: { gte: current.start, lt: current.end } }, select: { note: true, amount: true, targetEmployeeId: true } }),
    prismaPool[3].employee.findMany({ select: { id: true, name: true, role: true, active: true } }),
    prismaPool[4].settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);
  return JSON.parse(JSON.stringify({ bookings, cleaningLogs, expenses, employees, settings }));
}

const cachedFetchStaffData = unstable_cache(fetchStaffData, ["analytics-staff"], { revalidate: 60 });

export type StaffAnalyticsRow = {
  employeeId: string; name: string; role: string; bookingsLogged: number; cleaningsCompleted: number;
  commissionEarnedCentavos: number; totalEarnedCentavos: number; activitiesPerDay: number; subtitle: string;
};
export type StaffDrillDownBooking = { id: string; date: string; stayType: string; bookerId: string | null; cleanerId: string | null };
export type StaffAnalytics = { rows: StaffAnalyticsRow[]; bookings: StaffDrillDownBooking[] };

export async function getStaffAnalytics(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<StaffAnalytics> {
  const data = await cachedFetchStaffData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { bookings, cleaningLogs, expenses, employees, settings } = data;
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });
  const periodDays = daysInRange(current);
  const rates: PayrollRates = {
    housekeepingDayRate: settings.housekeepingDayRate,
    housekeepingNightBonus: settings.housekeepingNightBonus,
    bookerCommission: settings.bookerCommission,
    auditorWeeklyRate: settings.auditorWeeklyRate,
  };
  const rows = staffPerformance(employees, bookings, cleaningLogs, expenses, rates, periodDays / 7, periodDays);
  return {
    rows,
    bookings: bookings.map((b: any) => ({ id: b.id, date: b.date, stayType: b.stayType, bookerId: b.bookerId, cleanerId: b.cleanerId })),
  };
}

async function fetchUnitPerformanceData(
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

  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const [units, bookings, bills, blocks] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true, name: true, shortName: true, unitNumber: true, rating: true } }),
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: { unitId: true, stayType: true, date: true, checkOutDate: true, amount: true, paid: true, dpAmount: true, cancelledAt: true } }),
    prismaPool[2].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: current.start, lt: current.end } }, select: { unitId: true, amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    prismaPool[3].calendarBlock.findMany({
      where: { ...bookingUnitWhere, type: { in: ["Maintenance", "Cleaning"] }, date: { lt: current.end }, OR: [{ endDate: null }, { endDate: { gt: current.start } }] },
      select: { unitId: true, type: true, date: true, endDate: true },
    }),
  ]);
  return JSON.parse(JSON.stringify({ units, bookings, bills, blocks }));
}

const cachedFetchUnitPerformanceData = unstable_cache(fetchUnitPerformanceData, ["analytics-units"], { revalidate: 60 });

export type UnitPerformanceAnalytics = {
  rows: UnitPerformanceRow[];
  best: UnitPerformanceRow | null;
  worst: UnitPerformanceRow | null;
};

export async function getUnitPerformance(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<UnitPerformanceAnalytics> {
  const data = await cachedFetchUnitPerformanceData(
    user.role, user.ownedUnitIds, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { units, bookings, bills, blocks } = data;
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });

  const rows = unitPerformance(
    units.map((u: any) => ({ id: u.id, name: u.shortName, unitNumber: u.unitNumber, rating: u.rating })),
    bookings,
    bills,
    blocks.filter((b: any) => b.type === "Maintenance"),
    blocks.filter((b: any) => b.type === "Cleaning"),
    new Date(current.start),
    new Date(current.end)
  );
  const { best, worst } = bestWorstUnits(rows, "revenueCentavos");
  return { rows, best, worst };
}

// Monthly Revenue Goal panel — always the real current/previous CALENDAR
// MONTH (via periodRangeFor("monthly", ...)), independent of whatever
// period preset the filter bar has selected — "monthly target" is a fixed
// concept, not something that should shift if someone picks "This Week" on
// the same page. Same effectiveUnitIds scoping every other query here uses,
// so a Co-Owner only ever sees their own units' goals.
const goalBookingSelect = { unitId: true, date: true, amount: true, paid: true, dpAmount: true, refundedAt: true, bookerId: true } as const;

async function fetchRevenueGoalsData(role: string, ownedUnitIds: string[], filterUnitIdsJoined: string) {
  const user = { role, ownedUnitIds };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = effectiveUnitIds(user, filterUnitIds);
  const unitIdWhere = effective ? { id: { in: effective } } : {};
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};

  const current = periodRangeFor("monthly", 0);
  const previous = periodRangeFor("monthly", -1);

  const [units, bookingsThisMonth, bookingsLastMonth, settings] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true, shortName: true, unitNumber: true, monthlyRevenueTargetOverride: true } }),
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: goalBookingSelect }),
    prismaPool[2].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: previous.start, lt: previous.end } }, select: goalBookingSelect }),
    prismaPool[3].settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, select: { monthlyRevenueTargetPerUnit: true } }),
  ]);

  return JSON.parse(JSON.stringify({
    units, bookingsThisMonth, bookingsLastMonth,
    monthlyRevenueTargetPerUnit: settings.monthlyRevenueTargetPerUnit,
    monthStart: current.start, monthEnd: current.end,
  }));
}

const cachedFetchRevenueGoalsData = unstable_cache(fetchRevenueGoalsData, ["analytics-revenue-goals"], { revalidate: 60 });

export type RevenueGoalsData = Awaited<ReturnType<typeof fetchRevenueGoalsData>>;

export async function getRevenueGoalsData(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<RevenueGoalsData> {
  return cachedFetchRevenueGoalsData(user.role, user.ownedUnitIds, (filters.unitIds ?? []).join(","));
}

// Airbnb's own reported earnings (imported from the host account's PDF
// reports — see AirbnbEarningsMonth) compared month-by-month against what
// our own Booking records show for platform="Airbnb" in the same month.
// Bucketed by each booking's check-in date, same convention as every other
// coarse monthly rollup in this file — this is a reference/reconciliation
// view, not a proration-accurate revenue series (that's revenueSeries()).
async function fetchAirbnbEarningsComparison(role: string, ownedUnitIds: string[], filterUnitIdsJoined: string) {
  const user = { role, ownedUnitIds };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = effectiveUnitIds(user, filterUnitIds);
  const unitIdWhere = effective ? { id: { in: effective } } : {};
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};

  const [reportRows, units, airbnbBookings] = await Promise.all([
    prismaPool[0].airbnbEarningsMonth.findMany({ orderBy: { month: "asc" } }),
    prismaPool[1].unit.findMany({ where: unitIdWhere, select: { id: true, unitNumber: true, shortName: true } }),
    prismaPool[2].booking.findMany({
      where: { ...bookingUnitWhere, platform: "Airbnb", cancelledAt: null },
      select: { unitId: true, date: true, amount: true, dpAmount: true, paid: true },
    }),
  ]);
  const scopedUnitIds = new Set(units.map((u) => u.id));

  const appRevenueByMonth = new Map<string, number>();
  for (const b of airbnbBookings) {
    const key = new Date(Date.UTC(b.date.getUTCFullYear(), b.date.getUTCMonth(), 1)).toISOString();
    const collected = (b.paid ? b.amount : 0) + (b.dpAmount ?? 0);
    appRevenueByMonth.set(key, (appRevenueByMonth.get(key) ?? 0) + collected);
  }

  const scopedReportRows = effective ? reportRows.filter((r) => r.unitId === null || scopedUnitIds.has(r.unitId)) : reportRows;
  const monthKeys = [...new Set(scopedReportRows.map((r) => r.month.toISOString()))].sort();

  const months = monthKeys.map((monthIso) => {
    const portfolioRow = scopedReportRows.find((r) => r.month.toISOString() === monthIso && r.unitId === null && r.unitLabel === null);
    const unitRows = scopedReportRows.filter((r) => r.month.toISOString() === monthIso && (r.unitId !== null || r.unitLabel !== null));
    return {
      month: monthIso,
      reportedTotalPesos: portfolioRow ? portfolioRow.totalCentavos / 100 : null,
      appTrackedRevenuePesos: appRevenueByMonth.get(monthIso) ?? 0,
      unitDetail: unitRows.length > 0
        ? unitRows.map((r) => ({ unitId: r.unitId, unitLabel: r.unitLabel ?? "Unit", totalPesos: r.totalCentavos / 100 }))
        : null,
    };
  });

  return JSON.parse(JSON.stringify({ months }));
}

const cachedFetchAirbnbEarningsComparison = unstable_cache(fetchAirbnbEarningsComparison, ["analytics-airbnb-earnings"], { revalidate: 600 });

export type AirbnbEarningsComparison = Awaited<ReturnType<typeof fetchAirbnbEarningsComparison>>;

export async function getAirbnbEarningsComparison(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters): Promise<AirbnbEarningsComparison> {
  return cachedFetchAirbnbEarningsComparison(user.role, user.ownedUnitIds, (filters.unitIds ?? []).join(","));
}
