import { unstable_cache } from "next/cache";
import { prismaPool } from "@/lib/prisma";
import { dashboardUnitIdWhere } from "@/lib/session";
import { resolveAnalyticsPeriod, periodRangeFor, daysInRange, manilaNowPlaceholder, type AnalyticsPeriodPreset } from "@/lib/analytics/period";
import { computeOccupancy, computeADR, computeRevPAR, occupancyCalendarGrid, OCCUPANCY_CALENDAR_MAX_DAYS, type CalendarCell } from "@/lib/analytics/occupancy";
import { collectedRevenueCentavos, revenueGrowthPct, revenueSeries, revenueByDimension, type RevenuePoint, type RevenueDimensionRow } from "@/lib/analytics/revenue";
import { cancellationRate, avgStayLengthNights, bookingFunnel, leadTimeDistribution, peakDayCounts } from "@/lib/analytics/bookings";
import { guestRepeatRate, guestLifetimeValue, topGuests as topGuestsFn, frequentGuests as frequentGuestsFn, avgGuestsPerBooking } from "@/lib/analytics/guests";
import { trailingAverageForecast } from "@/lib/analytics/forecast";
import { netProfitCentavos, marginPct, paidExpensesCentavos, cashFlowCentavos, pendingExpensesCentavos, outstandingBalanceCentavos, accruedOperationalCostsCentavos } from "@/lib/analytics/financials";
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
  dpAmount: true, cancelledAt: true, refundedAt: true, guestId: true, contactNumber: true, guests: true,
} as const;

/**
 * The unit scope every Analytics query is filtered by: the caller's
 * portfolio (dashboardUnitIdWhere — same Co-owner/scoped-Owner rule
 * Dashboard uses) intersected with whatever the filter bar's Unit select
 * has chosen. Intersecting (not overriding) is what stops a scoped user
 * from ever seeing a unit outside their own portfolio just by picking it
 * in the filter bar.
 *
 * Always resolves to a real (possibly empty) array — never null. It used
 * to return null for "no restriction at all" whenever dashboardUnitIdWhere
 * had no `id: {in: [...]}` (the CO_OWNER-subset case), which was correct
 * back when "no restriction" genuinely meant "every unit, full stop." Now
 * that dashboardUnitIdWhere can also carry an `ownerId` filter with no
 * `id` field at all (an OWNER_ADMIN with no CO_OWNER-style subset — most
 * owners), that null shortcut was silently discarding the owner boundary:
 * every fetchXData function below intersects/uses this against real
 * queries, so "no restriction" must never again mean "every owner's
 * units" — caught via live cross-tenant testing (a second owner's
 * Analytics page was showing Evangelina's real revenue/guest data), not
 * type-checking, since the types alone didn't reveal it.
 */
async function effectiveUnitIds(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filterUnitIds: string[] | null | undefined): Promise<string[]> {
  const baseIdWhere = dashboardUnitIdWhere(user) as { id?: { in: string[] } };
  const basePortfolio = baseIdWhere.id?.in ?? (await prismaPool[0].unit.findMany({ where: { ownerId: user.ownerId }, select: { id: true } })).map((u) => u.id);
  if (!filterUnitIds || filterUnitIds.length === 0) return basePortfolio;
  return basePortfolio.filter((id) => filterUnitIds.includes(id));
}

async function fetchKpiData(
  role: string,
  ownedUnitIds: string[],
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
  const unitIdWhere = effective ? { id: { in: effective } } : {};
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const billUnitWhere = effective ? { unitId: { in: effective } } : {};

  const { current, previous } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  // Monthly Forecast is deliberately independent of the selected filter
  // period — it's always "based on the last few real calendar months",
  // regardless of whether the user is currently looking at Today or This
  // Year elsewhere on the page.
  const trailingMonths = [3, 2, 1].map((n) => periodRangeFor("monthly", -n));

  const [
    units, currentBookings, previousBookings, blocks, currentPaidBills, previousPaidBills,
    employees, salaryHistory, weeklyExpensesCurrent, weeklyExpensesPrevious, expenseRequestsCurrent, expenseRequestsPrevious,
    airbnbHistoricalRows,
    ...trailingMonthBookings
  ] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true } }),
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: kpiBookingSelect }),
    prismaPool[2].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: previous.start, lt: previous.end } }, select: kpiBookingSelect }),
    prismaPool[3].calendarBlock.findMany({
      where: { ...bookingUnitWhere, type: { in: ["Maintenance", "Cleaning"] }, date: { lt: current.end }, OR: [{ endDate: null }, { endDate: { gt: current.start } }] },
      select: { unitId: true, type: true, date: true, endDate: true },
    }),
    prismaPool[4].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: current.start, lt: current.end } }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    prismaPool[5].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: previous.start, lt: previous.end } }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    // Accrued payroll + operational costs — see accruedOperationalCostsCentavos
    // in analytics/financials.ts. Not unit-scoped (payroll/ads are property-
    // wide, same as Dashboard's own version), and salaryHistory is fetched
    // whole (unfiltered by date) since totalSalaryPayroll needs full history
    // to find whichever rate was actually effective at periodStart.
    prismaPool[6].employee.findMany({ where: { ownerId }, select: { id: true, role: true, monthlySalary: true, active: true } }),
    prismaPool[7].salaryHistory.findMany({ select: { employeeId: true, monthlySalary: true, effectiveDate: true } }),
    prismaPool[8].weeklyExpense.findMany({ where: { category: "TIKTOK_ADS", date: { gte: current.start, lt: current.end } }, select: { category: true, amount: true } }),
    prismaPool[9].weeklyExpense.findMany({ where: { category: "TIKTOK_ADS", date: { gte: previous.start, lt: previous.end } }, select: { category: true, amount: true } }),
    prismaPool[10].expenseRequest.findMany({ where: { status: "APPROVED", date: { gte: current.start, lt: current.end } }, select: { category: true, amount: true, status: true } }),
    prismaPool[11].expenseRequest.findMany({ where: { status: "APPROVED", date: { gte: previous.start, lt: previous.end } }, select: { category: true, amount: true, status: true } }),
    // Airbnb's own officially-reported monthly totals (Feb 2025 - Mar 2026,
    // mostly pre-dating this app) — same record-keeping fallback Dashboard's
    // Earnings card already applies (useEarningsData.ts), ported here so
    // "Total Revenue" agrees between the two tabs for a historical month
    // instead of Analytics silently showing ~₱0 for a month the business
    // genuinely earned real (Airbnb-tracked, not this-app-tracked) money.
    prismaPool[12].airbnbEarningsMonth.findMany({
      where: { unitId: null, month: { gte: new Date("2025-02-01"), lte: new Date("2026-03-01") } },
      select: { month: true, totalCentavos: true },
    }),
    ...trailingMonths.map((range, i) =>
      prismaPool[(12 + i) % 13].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: range.start, lt: range.end } }, select: { amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true } })
    ),
  ]);

  return JSON.parse(JSON.stringify({
    units, currentBookings, previousBookings, blocks, currentPaidBills, previousPaidBills,
    employees, salaryHistory, weeklyExpensesCurrent, weeklyExpensesPrevious, expenseRequestsCurrent, expenseRequestsPrevious,
    airbnbHistoricalRows,
    trailingMonthBookings,
  }));
}

const cachedFetchKpiData = unstable_cache(fetchKpiData, ["analytics-kpis"], { revalidate: 60 });

export type ExecutiveKPIs = {
  totalRevenueCentavos: number;
  // Revenue/profit *through today* within the current period — used for
  // growth-% comparisons (see revenueGrowthPct below) and the Hero card's
  // headline. Distinct from totalRevenueCentavos, which is the full
  // nominal-period total (e.g. all of August, including already-confirmed
  // future-dated bookings) — that stays unchanged for the existing KPI
  // row's own display. Equal to totalRevenueCentavos whenever the period
  // has already fully elapsed (Today, Yesterday, a past custom range).
  mtdRevenueCentavos: number;
  mtdNetProfitCentavos: number;
  // Human-readable label for exactly what mtd*/growth% were compared
  // against — e.g. "Jul 1–8" — so a comparison badge is never shown
  // without saying what it's relative to.
  comparisonPeriodLabel: string;
  netProfitCentavos: number;
  netProfitNote: string;
  // Percentage-point delta (not a growth %) — a margin's own unit is
  // already a percent, so "up 2.3 points" reads correctly where "up 2.3%"
  // would be ambiguous (2.3% of what — the margin itself, or revenue?).
  marginPct: number;
  marginPctPointsDelta: number | null;
  bookingsGrowthPct: number | null;
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

export async function getExecutiveKPIs(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<ExecutiveKPIs> {
  const data = await cachedFetchKpiData(
    user.role,
    user.ownedUnitIds,
    user.ownerId,
    filters.preset,
    filters.customStart ?? "",
    filters.customEnd ?? "",
    (filters.unitIds ?? []).join(",")
  );
  const {
    units, currentBookings, previousBookings, blocks, currentPaidBills, previousPaidBills,
    employees, salaryHistory, weeklyExpensesCurrent, weeklyExpensesPrevious, expenseRequestsCurrent, expenseRequestsPrevious,
    airbnbHistoricalRows, trailingMonthBookings,
  } = data;
  const { current, previous } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });
  const currentStart = new Date(current.start);
  const currentEnd = new Date(current.end);
  const previousStart = new Date(previous.start);
  const previousEnd = new Date(previous.end);

  const rawRevenueCentavos = collectedRevenueCentavos(currentBookings);
  const previousRevenueCentavos = collectedRevenueCentavos(previousBookings);

  // Historical-record fallback — same scoping as Dashboard's Earnings card
  // (useEarningsData.ts): only substitutes Airbnb's own reported total when
  // the selected range is exactly one calendar month AND this app has zero
  // tracked bookings for it (i.e. before this app existed); real tracked
  // revenue always wins. Deliberately only affects the headline
  // totalRevenueCentavos returned below — RevPAR/Net Profit/growth-rate
  // keep using rawRevenueCentavos, matching Dashboard's own scoping, so a
  // historical month doesn't fabricate a misleadingly-precise RevPAR off a
  // monthly total nobody actually recorded per-booking.
  const isExactCalendarMonth =
    currentStart.getUTCDate() === 1 &&
    currentEnd.getTime() === Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + 1, 1);
  const historicalMonthKey = `${currentStart.getUTCFullYear()}-${String(currentStart.getUTCMonth() + 1).padStart(2, "0")}`;
  const airbnbHistoricalMonthly: Record<string, number> = Object.fromEntries(
    airbnbHistoricalRows.map((r: { month: string; totalCentavos: number }) => [
      `${new Date(r.month).getUTCFullYear()}-${String(new Date(r.month).getUTCMonth() + 1).padStart(2, "0")}`,
      r.totalCentavos,
    ])
  );
  const totalRevenueCentavos =
    isExactCalendarMonth && rawRevenueCentavos <= 0 && airbnbHistoricalMonthly[historicalMonthKey] != null
      ? airbnbHistoricalMonthly[historicalMonthKey]
      : rawRevenueCentavos;

  const currentPaidExpensesCents = paidExpensesCentavos(currentPaidBills);
  const previousPaidExpensesCents = paidExpensesCentavos(previousPaidBills);
  // Accrued payroll + TikTok ads + approved expense requests — see
  // accruedOperationalCostsCentavos's own doc comment for why this exists:
  // Net Profit previously only ever subtracted paid Bills, silently
  // overstating it by the full payroll amount for the period.
  const currentOtherCostsCents = accruedOperationalCostsCentavos({
    employees, salaryHistory, weeklyExpenses: weeklyExpensesCurrent, expenseRequests: expenseRequestsCurrent,
    periodStart: currentStart, periodEnd: currentEnd,
  });
  const previousOtherCostsCents = accruedOperationalCostsCentavos({
    employees, salaryHistory, weeklyExpenses: weeklyExpensesPrevious, expenseRequests: expenseRequestsPrevious,
    periodStart: previousStart, periodEnd: previousEnd,
  });
  const netProfit = netProfitCentavos({ revenueCentavos: rawRevenueCentavos, paidExpensesCentavos: currentPaidExpensesCents, otherPaidCostsCentavos: currentOtherCostsCents });
  const previousNetProfit = netProfitCentavos({ revenueCentavos: previousRevenueCentavos, paidExpensesCentavos: previousPaidExpensesCents, otherPaidCostsCentavos: previousOtherCostsCents });

  const occ = computeOccupancy({
    unitCount: units.length,
    periodStart: currentStart,
    periodEnd: currentEnd,
    bookings: currentBookings,
    maintenanceBlocks: blocks.filter((b: any) => b.type === "Maintenance"),
    cleaningBlocks: blocks.filter((b: any) => b.type === "Cleaning"),
  });
  const adr = computeADR(currentBookings, currentStart, currentEnd);
  const revpar = computeRevPAR(rawRevenueCentavos, occ.availableNights);

  const repeat = guestRepeatRate(currentBookings);

  const monthlyTotals = trailingMonthBookings.map((rows: any[]) => collectedRevenueCentavos(rows));
  const forecast = trailingAverageForecast(monthlyTotals);

  // Growth-% and the Hero card's headline must compare like-for-like — "Aug
  // 1-8" against "Jul 1-8", never "all of August" (which, unlike a plain
  // calendar boundary, already includes real revenue from confirmed
  // future-dated bookings within the month) against a necessarily-shorter
  // clipped previous window. previousBookings/previousNetProfit are
  // already correctly elapsed-clipped (see previousPeriodRangeFor in
  // period.ts); this mirrors that same clipping onto `current`, filtering
  // the already-fetched currentBookings array in memory — no extra query.
  // accruedOperationalCostsCentavos already internally clamps periodEnd to
  // "now" regardless of what's passed in, and a bill's paidAt can't be a
  // future date by definition, so currentOtherCostsCents/
  // currentPaidExpensesCents need no separate clipping here.
  const elapsedCutoff = new Date(Math.min(manilaNowPlaceholder().getTime(), currentEnd.getTime()));
  const elapsedCurrentBookings = currentBookings.filter((b: any) => new Date(b.date).getTime() < elapsedCutoff.getTime());
  const mtdRevenueCentavos = collectedRevenueCentavos(elapsedCurrentBookings);
  const mtdNetProfitCentavos = netProfitCentavos({ revenueCentavos: mtdRevenueCentavos, paidExpensesCentavos: currentPaidExpensesCents, otherPaidCostsCentavos: currentOtherCostsCents });
  const comparisonPeriodLabel = formatDateRangeShort(previousStart, new Date(previousEnd.getTime() - 86400000));
  const currentMarginPct = marginPct(mtdNetProfitCentavos, mtdRevenueCentavos);
  const previousMarginPct = marginPct(previousNetProfit, previousRevenueCentavos);
  // Bookings growth is cheap and honest to compute (both arrays are already
  // fetched, no elapsed-clipping needed — a booking either exists or it
  // doesn't, there's no "future portion" ambiguity the way revenue has).
  // Occupancy/ADR/RevPAR growth is deliberately NOT computed here — a fair
  // previous-period occupancy would need previous-period Maintenance/
  // Cleaning blocks too, which aren't fetched (only the current window's
  // are) — rather than approximate it without them, this stays an honest
  // "no prior period" in the UI until that query is added.
  const bookingsGrowthPct = revenueGrowthPct(currentBookings.length, previousBookings.length);

  return {
    totalRevenueCentavos,
    mtdRevenueCentavos,
    mtdNetProfitCentavos,
    comparisonPeriodLabel,
    netProfitCentavos: netProfit,
    netProfitNote: "Revenue minus paid bills, accrued staff payroll, and approved expenses for this period.",
    marginPct: currentMarginPct,
    marginPctPointsDelta: previousRevenueCentavos > 0 ? currentMarginPct - previousMarginPct : null,
    bookingsGrowthPct,
    occupancyPct: occ.occupancyPct,
    adrCentavos: adr * 100,
    revparCentavos: revpar * 100,
    totalBookings: currentBookings.length,
    cancellationRatePct: cancellationRate(currentBookings),
    avgStayLengthNights: avgStayLengthNights(currentBookings),
    repeatGuestRatePct: repeat.repeatRatePct,
    repeatGuestBasis: repeat.basis,
    revenueGrowthPct: revenueGrowthPct(mtdRevenueCentavos, previousRevenueCentavos),
    profitGrowthPct: revenueGrowthPct(mtdNetProfitCentavos, previousNetProfit),
    monthlyForecastCentavos: forecast.forecastCentavos,
    forecastMethod: forecast.method,
    forecastConfidence: forecast.confidence,
    unitCount: units.length,
  };
}

/** "Jul 1–8" — a short, human comparison-period label spanning [start, inclusiveEnd]. */
function formatDateRangeShort(start: Date, inclusiveEnd: Date): string {
  const fmt = (d: Date, withMonth: boolean) =>
    `${withMonth ? d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + " " : ""}${d.getUTCDate()}`;
  const sameMonth = start.getUTCMonth() === inclusiveEnd.getUTCMonth() && start.getUTCFullYear() === inclusiveEnd.getUTCFullYear();
  return sameMonth ? `${fmt(start, true)}–${fmt(inclusiveEnd, false)}` : `${fmt(start, true)}–${fmt(inclusiveEnd, true)}`;
}

/** day for short periods, week for a quarter, month for a year+ — keeps a trend chart from either showing one bar (a year bucketed by day) or a flat line (a day bucketed by month). */
function granularityForPeriod(start: Date, end: Date): "day" | "week" | "month" {
  const days = daysInRange({ start, end });
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

const revenueBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true, platform: true, stayType: true, method: true,
} as const;

async function fetchRevenueData(
  role: string,
  ownedUnitIds: string[],
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
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

export async function getRevenueAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<RevenueAnalytics> {
  const data = await cachedFetchRevenueData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
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
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const billUnitWhere = effective ? { unitId: { in: effective } } : {};

  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const [bookings, paidBills, pendingBills, employees, salaryHistory, weeklyExpenses, expenseRequests] = await Promise.all([
    prismaPool[0].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: { amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true } }),
    prismaPool[1].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: current.start, lt: current.end } }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    // Pending bills are a "right now" figure, not period-scoped — an unpaid
    // bill doesn't really belong to "last quarter" in a meaningful sense
    // once that quarter's ensureRecurringBillsForMonth cycle has already
    // regenerated the next one. Scoping this to the selected period would
    // require guessing which Bill.month buckets the period covers, a
    // shakier heuristic than just showing what's actually outstanding now.
    prismaPool[2].bill.findMany({ where: { ...billUnitWhere, paid: false }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true, paid: true } }),
    // Accrued payroll + operational costs — same as getExecutiveKPIs, see
    // accruedOperationalCostsCentavos's doc comment. Cash Flow previously
    // only ever subtracted paid Bills, so it silently equaled Net Revenue
    // whenever paid Bills were ₱0, no matter how much payroll had actually
    // gone out the door.
    prismaPool[3].employee.findMany({ where: { ownerId }, select: { id: true, role: true, monthlySalary: true, active: true } }),
    prismaPool[4].salaryHistory.findMany({ select: { employeeId: true, monthlySalary: true, effectiveDate: true } }),
    prismaPool[5].weeklyExpense.findMany({ where: { category: "TIKTOK_ADS", date: { gte: current.start, lt: current.end } }, select: { category: true, amount: true } }),
    prismaPool[6].expenseRequest.findMany({ where: { status: "APPROVED", date: { gte: current.start, lt: current.end } }, select: { category: true, amount: true, status: true } }),
  ]);

  return JSON.parse(JSON.stringify({ bookings, paidBills, pendingBills, employees, salaryHistory, weeklyExpenses, expenseRequests }));
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

export async function getFinancialAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<FinancialAnalytics> {
  const data = await cachedFetchFinancialData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { bookings, paidBills, pendingBills, employees, salaryHistory, weeklyExpenses, expenseRequests } = data;
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });

  const grossRevenueCentavos = bookings.reduce((s: number, b: any) => (b.cancelledAt ? s : s + b.amount * 100), 0);
  const netRevenueCentavos = collectedRevenueCentavos(bookings);
  const paidExpensesCents = paidExpensesCentavos(paidBills);
  const pendingExpensesCents = pendingExpensesCentavos(pendingBills);
  const otherCostsCents = accruedOperationalCostsCentavos({
    employees, salaryHistory, weeklyExpenses, expenseRequests,
    periodStart: new Date(current.start), periodEnd: new Date(current.end),
  });
  const cashFlow = cashFlowCentavos({ revenueCentavos: netRevenueCentavos, paidExpensesCentavos: paidExpensesCents, otherPaidCostsCentavos: otherCostsCents });
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
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
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

export async function getBookingAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<BookingAnalytics> {
  const data = await cachedFetchBookingData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
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
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
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

export async function getOccupancyAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<OccupancyAnalytics> {
  const data = await cachedFetchOccupancyData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
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
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const guestSelect = { guestId: true, contactNumber: true, guests: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true, pax: true } as const;
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

export async function getGuestAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<GuestAnalytics> {
  const data = await cachedFetchGuestData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
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
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
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
    prismaPool[2].employee.findMany({ where: { active: true, ownerId }, select: { id: true, name: true } }),
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

export async function getHousekeepingAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<HousekeepingAnalytics> {
  const data = await cachedFetchHousekeepingData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
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
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
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
      select: { id: true, bookerId: true, cleanerId: true, unitId: true, stayType: true, date: true, checkOutDate: true, checkOutTime: true, paid: true, cancelledAt: true, cancellationCategory: true, dpAmount: true, refundedAt: true },
    }),
    prismaPool[1].cleaningLog.findMany({ where: { startedAt: { gte: current.start, lt: current.end } }, select: { employeeId: true, startedAt: true } }),
    prismaPool[2].weeklyExpense.findMany({ where: { date: { gte: current.start, lt: current.end } }, select: { note: true, amount: true, targetEmployeeId: true } }),
    prismaPool[3].employee.findMany({ where: { ownerId }, select: { id: true, name: true, role: true, active: true } }),
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

export async function getStaffAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<StaffAnalytics> {
  const data = await cachedFetchStaffData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
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
  ownerId: string | null,
  preset: AnalyticsPeriodPreset,
  customStart: string,
  customEnd: string,
  filterUnitIdsJoined: string
) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
  const unitIdWhere = effective ? { id: { in: effective } } : {};
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const billUnitWhere = effective ? { unitId: { in: effective } } : {};

  const { current } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });

  const [units, bookings, bills, blocks] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true, name: true, shortName: true, unitNumber: true, rating: true } }),
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: { unitId: true, stayType: true, date: true, checkOutDate: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true } }),
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

export async function getUnitPerformance(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<UnitPerformanceAnalytics> {
  const data = await cachedFetchUnitPerformanceData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
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

async function fetchRevenueGoalsData(role: string, ownedUnitIds: string[], ownerId: string | null, filterUnitIdsJoined: string) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
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

export async function getRevenueGoalsData(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<RevenueGoalsData> {
  return cachedFetchRevenueGoalsData(user.role, user.ownedUnitIds, user.ownerId, (filters.unitIds ?? []).join(","));
}
