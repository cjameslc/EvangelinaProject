import { unstable_cache } from "next/cache";
import { prismaPool } from "@/lib/prisma";
import { dashboardUnitIdWhere } from "@/lib/session";
import { resolveAnalyticsPeriod, periodRangeFor, daysInRange, type AnalyticsPeriodPreset } from "@/lib/analytics/period";
import { computeOccupancy, computeADR, computeRevPAR, occupancyCalendarGrid, OCCUPANCY_CALENDAR_MAX_DAYS, type CalendarCell } from "@/lib/analytics/occupancy";
import { collectedRevenueCentavos, revenueGrowthPct, revenueSeries, revenueByDimension, type RevenuePoint, type RevenueDimensionRow } from "@/lib/analytics/revenue";
import { cancellationRate, avgStayLengthNights, bookingFunnel, leadTimeDistribution, peakDayCounts } from "@/lib/analytics/bookings";
import { guestRepeatRate } from "@/lib/analytics/guests";
import { trailingAverageForecast } from "@/lib/analytics/forecast";
import { netProfitCentavos, paidExpensesCentavos, cashFlowCentavos, pendingExpensesCentavos, outstandingBalanceCentavos } from "@/lib/analytics/financials";

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
  id: true, unitId: true, date: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, platform: true, stayType: true, method: true,
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

export type DrillDownBooking = { id: string; date: string; unitLabel: string; stayType: string; amount: number; paid: boolean };

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
    series: revenueSeries(bookings, granularity),
    granularity,
    byUnit: revenueByDimension(bookings, "unit", unitLabels),
    bySource: revenueByDimension(bookings, "source"),
    byStayType: revenueByDimension(bookings, "stayType"),
    byPaymentMethod: revenueByDimension(bookings, "paymentMethod"),
    bookings: bookings
      .filter((b: any) => !b.cancelledAt)
      .map((b: any) => ({ id: b.id, date: b.date, unitLabel: unitLabels[b.unitId] ?? b.unitId, stayType: b.stayType, amount: b.amount, paid: b.paid })),
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
