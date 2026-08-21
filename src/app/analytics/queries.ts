import { unstable_cache } from "next/cache";
import { prisma, prismaPool } from "@/lib/prisma";
import { dashboardUnitIdWhere } from "@/lib/session";
import { resolveAnalyticsPeriod, periodRangeFor, daysInRange, manilaNowPlaceholder, type AnalyticsPeriodPreset } from "@/lib/analytics/period";
import { computeOccupancy, computeADR, computeRevPAR, occupancyCalendarGrid, OCCUPANCY_CALENDAR_MAX_DAYS, type CalendarCell } from "@/lib/analytics/occupancy";
import { collectedRevenueCentavos, revenueGrowthPct, revenueSeries, revenueByDimension, elapsedBookings, type RevenuePoint, type RevenueDimensionRow } from "@/lib/analytics/revenue";
import { cancellationRate, avgStayLengthNights, bookingFunnel, leadTimeDistribution, peakDayCounts } from "@/lib/analytics/bookings";
import { guestRepeatRate, guestLifetimeValue, topGuests as topGuestsFn, frequentGuests as frequentGuestsFn, avgGuestsPerBooking } from "@/lib/analytics/guests";
import { trailingAverageForecast } from "@/lib/analytics/forecast";
import { netProfitCentavos, marginPct, paidExpensesCentavos, cashFlowCentavos, pendingExpensesCentavos, outstandingBalanceCentavos, accruedOperationalCostsCentavos } from "@/lib/analytics/financials";
import { grossAmountCentavos } from "@/lib/finance";
import { cleaningStats, cleanerPerformance, delayedCleanings, roomsReadySnapshot } from "@/lib/analytics/housekeeping";
import { staffPerformance } from "@/lib/analytics/staff";
import type { PayrollRates } from "@/lib/payroll";
import { unitPerformance, bestWorstUnits, type UnitPerformanceRow } from "@/lib/analytics/units";
import { formatUnitDisplay } from "@/lib/format";
import { applyBookingFilters, hasActiveBookingFilters, type BookingFilterExtra, type BookingStatusFilter } from "@/lib/analytics/bookingFilters";
import {
  computeForecastConfidence, computeMonthlyForecastSummary, forecastByDayOfWeek, forecastByUnit, forecastByBooker,
  forecastBySource, generateForecastInsights, type ForecastBooking, type MonthlyForecastSummary, type WeekdayRow,
  type UnitForecastRow, type BookerForecastRow, type SourceForecastRow, type ForecastInsight,
} from "@/lib/analytics/forecastEngine";
import {
  computeIncomeBreakdown, computeExpenseBreakdown, computeThreeProfitViews, computeWaterfall, computeBreakEven,
  computeContributionByDimension, computeUnitEconomics, computeBookerProfitability, computeSourceProfitability,
  computeBusinessHealthVerdict, computeRedFlags, generateBrutalTruths, computeStatusQuoProjection, computeTopActions,
  type ProfitBooking, type IncomeBreakdown, type ExpenseBreakdown, type ThreeProfitViews, type WaterfallStep,
  type BreakEvenResult, type ContributionRow, type UnitEconomicsRow, type BookerProfitRow, type SourceProfitRow,
  type HealthVerdict, type RedFlag, type BrutalTruth, type StatusQuoProjection, type ActionRecommendation,
} from "@/lib/analytics/profitability";

export type AnalyticsFilters = {
  preset: AnalyticsPeriodPreset;
  customStart?: string;
  customEnd?: string;
  unitIds?: string[] | null;
  // Booker/Platform/Stay Type/Status — applied post-fetch (see
  // bookingFilters.ts), page-wide across every Analytics section, not just
  // Forecast. Empty/undefined on every existing bookmark or link, which is
  // exactly what keeps rolling this out across already-shipped sections
  // safe: applyBookingFilters returns its input unchanged when nothing's
  // set here.
  bookerIds?: string[] | null;
  platforms?: string[] | null;
  stayTypes?: string[] | null;
  statuses?: BookingStatusFilter[] | null;
};

function extraFiltersOf(filters: AnalyticsFilters): BookingFilterExtra {
  return { bookerIds: filters.bookerIds, platforms: filters.platforms, stayTypes: filters.stayTypes, statuses: filters.statuses };
}

const kpiBookingSelect = {
  id: true, unitId: true, date: true, checkOutDate: true, stayType: true, amount: true, paid: true,
  dpAmount: true, cancelledAt: true, refundedAt: true, guestId: true, contactNumber: true, guests: true,
  bookerId: true, platform: true, checkInTime: true, checkOutTime: true,
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
    // ownerId directly on WeeklyExpense (TIKTOK_ADS is always untargeted, so
    // there's no employee to scope through — see its own doc comment) and
    // via employee.ownerId on ExpenseRequest (employeeId is required there).
    // Previously unscoped: every tenant's ad spend/approved expenses were
    // being subtracted from every other tenant's Net Profit, including a
    // brand-new owner with zero real activity showing a negative number.
    prismaPool[8].weeklyExpense.findMany({ where: { ownerId, category: "TIKTOK_ADS", date: { gte: current.start, lt: current.end } }, select: { category: true, amount: true } }),
    prismaPool[9].weeklyExpense.findMany({ where: { ownerId, category: "TIKTOK_ADS", date: { gte: previous.start, lt: previous.end } }, select: { category: true, amount: true } }),
    prismaPool[10].expenseRequest.findMany({ where: { status: "APPROVED", date: { gte: current.start, lt: current.end }, employee: { ownerId } }, select: { category: true, amount: true, status: true } }),
    prismaPool[11].expenseRequest.findMany({ where: { status: "APPROVED", date: { gte: previous.start, lt: previous.end }, employee: { ownerId } }, select: { category: true, amount: true, status: true } }),
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
  // Real daily collected-revenue series for the elapsed portion of the
  // current period, in pesos — feeds the Revenue KPI card's sparkline.
  // Never fabricated: fewer than 2 real buckets (e.g. viewing "Today")
  // just means no sparkline renders, see Sparkline.tsx.
  revenueSparkline: number[];
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
  const data: any = await cachedFetchKpiData(
    user.role,
    user.ownedUnitIds,
    user.ownerId,
    filters.preset,
    filters.customStart ?? "",
    filters.customEnd ?? "",
    (filters.unitIds ?? []).join(",")
  );
  const {
    units, blocks, currentPaidBills, previousPaidBills,
    employees, salaryHistory, weeklyExpensesCurrent, weeklyExpensesPrevious, expenseRequestsCurrent, expenseRequestsPrevious,
    airbnbHistoricalRows,
  } = data;
  // Booker/Platform/Stay Type/Status filters — applied once here, so every
  // KPI/chart below (which all read currentBookings/previousBookings/
  // trailingMonthBookings) automatically respects them without each needing
  // its own filter step. No-op when nothing's set (see bookingFilters.ts).
  const extra = extraFiltersOf(filters);
  const currentBookings = applyBookingFilters(data.currentBookings, extra) as any[];
  const previousBookings = applyBookingFilters(data.previousBookings, extra) as any[];
  const trailingMonthBookings = data.trailingMonthBookings.map((arr: any[]) => applyBookingFilters(arr, extra) as any[]);
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
  const elapsedCurrentBookings = elapsedBookings<(typeof currentBookings)[number]>(currentBookings, currentEnd);
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
  const revenueSparkline = revenueSeries(elapsedCurrentBookings, "day", currentStart, elapsedCutoff)
    .map((p: RevenuePoint) => p.collectedCentavos / 100);

  return {
    totalRevenueCentavos,
    mtdRevenueCentavos,
    mtdNetProfitCentavos,
    comparisonPeriodLabel,
    revenueSparkline,
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
  bookerId: true, checkInTime: true, checkOutTime: true,
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
  const data: any = await cachedFetchRevenueData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { units } = data;
  const bookings = applyBookingFilters(data.bookings, extraFiltersOf(filters)) as any[];
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
    prismaPool[0].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: { amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true, bookerId: true, platform: true, stayType: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true } }),
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
    // See the matching comment in fetchKpiData above — same owner-leak fix.
    prismaPool[5].weeklyExpense.findMany({ where: { ownerId, category: "TIKTOK_ADS", date: { gte: current.start, lt: current.end } }, select: { category: true, amount: true } }),
    prismaPool[6].expenseRequest.findMany({ where: { status: "APPROVED", date: { gte: current.start, lt: current.end }, employee: { ownerId } }, select: { category: true, amount: true, status: true } }),
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
  const data: any = await cachedFetchFinancialData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { paidBills, pendingBills, employees, salaryHistory, weeklyExpenses, expenseRequests } = data;
  const bookings = applyBookingFilters(data.bookings, extraFiltersOf(filters)) as any[];
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });

  // grossAmountCentavos, not bare amount*100 — amount alone is only the
  // remaining balance once a downpayment's been verified (see its doc
  // comment in finance.ts). Using amount alone here was a real, confirmed
  // bug: it could make Net Revenue (paid + dpAmount, correctly reconstructed)
  // read HIGHER than Gross Revenue for the same real bookings.
  const grossRevenueCentavos = bookings.reduce((s: number, b: any) => (b.cancelledAt ? s : s + grossAmountCentavos(b)), 0);
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
  bookerId: true, platform: true, checkInTime: true, checkOutTime: true,
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
  const data: any = await cachedFetchBookingData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const bookings = applyBookingFilters(data.bookings, extraFiltersOf(filters)) as any[];
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
  bookerId: true, platform: true, checkInTime: true, checkOutTime: true,
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
  const data: any = await cachedFetchOccupancyData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { units, blocks, calendarStart, calendarEnd } = data;
  const extra = extraFiltersOf(filters);
  const bookings = applyBookingFilters(data.bookings, extra) as any[];
  const trailingMonthData = data.trailingMonthData.map((m: any) => ({ ...m, bookings: applyBookingFilters(m.bookings, extra) as any[] }));
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

  const guestSelect = {
    guestId: true, contactNumber: true, guests: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true, pax: true,
    date: true, checkOutDate: true, bookerId: true, platform: true, stayType: true, checkInTime: true, checkOutTime: true,
  } as const;
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
  const data: any = await cachedFetchGuestData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const extra = extraFiltersOf(filters);
  const periodBookings = applyBookingFilters(data.periodBookings, extra) as any[];
  const allTimeBookings = applyBookingFilters(data.allTimeBookings, extra) as any[];
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
      select: { id: true, bookerId: true, cleanerId: true, unitId: true, stayType: true, date: true, checkOutDate: true, checkOutTime: true, checkInTime: true, paid: true, cancelledAt: true, cancellationCategory: true, dpAmount: true, refundedAt: true, platform: true },
    }),
    prismaPool[1].cleaningLog.findMany({ where: { startedAt: { gte: current.start, lt: current.end } }, select: { employeeId: true, startedAt: true } }),
    prismaPool[2].weeklyExpense.findMany({ where: { ownerId, date: { gte: current.start, lt: current.end } }, select: { note: true, amount: true, targetEmployeeId: true } }),
    prismaPool[3].employee.findMany({ where: { ownerId }, select: { id: true, name: true, role: true, active: true } }),
    prismaPool[4].settings.upsert({ where: { ownerId: ownerId! }, update: {}, create: { ownerId: ownerId! } }),
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
  const data: any = await cachedFetchStaffData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { cleaningLogs, expenses, employees, settings } = data;
  const bookings = applyBookingFilters(data.bookings, extraFiltersOf(filters)) as any[];
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

export type CommissionAnalyticsRow = { employeeId: string; name: string; role: string; bookingsCount: number; commissionCentavos: number };
export type CommissionAnalytics = { totalCommissionCentavos: number; bookerCommissionRate: number; rows: CommissionAnalyticsRow[] };

/**
 * Total commission paid out + who earned it, for the selected period.
 * Deliberately reuses getStaffAnalytics's rows rather than a second
 * bookings/commission calculation — commissionEarnedCentavos there already
 * comes from computeTeamBreakdown, the exact same formula Dashboard's
 * "Your team", My Earnings, and Admin's payroll all share, so this can
 * never quietly disagree with those the way this app's revenue figures
 * once did (see elapsedBookings's doc comment in analytics/revenue.ts).
 * bookingsCount is derived from the amount (commission ÷ flat rate) rather
 * than re-filtering bookings by isCommissionEligible a second time, for
 * the same reason — one source of truth per number, not two paths to the
 * same fact.
 */
export async function getCommissionAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<CommissionAnalytics> {
  const [staff, settings] = await Promise.all([
    getStaffAnalytics(user, filters),
    prisma.settings.upsert({ where: { ownerId: user.ownerId! }, update: {}, create: { ownerId: user.ownerId! } }),
  ]);
  const rate = settings.bookerCommission;
  const rows = staff.rows
    .filter((r) => r.commissionEarnedCentavos > 0)
    .map((r) => ({
      employeeId: r.employeeId,
      name: r.name,
      role: r.role,
      bookingsCount: rate > 0 ? Math.round(r.commissionEarnedCentavos / 100 / rate) : 0,
      commissionCentavos: r.commissionEarnedCentavos,
    }))
    .sort((a, b) => b.commissionCentavos - a.commissionCentavos);
  return {
    totalCommissionCentavos: rows.reduce((s, r) => s + r.commissionCentavos, 0),
    bookerCommissionRate: rate,
    rows,
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
    prismaPool[1].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: current.start, lt: current.end } }, select: { unitId: true, stayType: true, date: true, checkOutDate: true, amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true, bookerId: true, platform: true, checkInTime: true, checkOutTime: true } }),
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
  const data: any = await cachedFetchUnitPerformanceData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const { units, bills, blocks } = data;
  const bookings = applyBookingFilters(data.bookings, extraFiltersOf(filters)) as any[];
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
const goalBookingSelect = {
  unitId: true, date: true, amount: true, paid: true, dpAmount: true, refundedAt: true, bookerId: true,
  platform: true, stayType: true, checkOutDate: true, checkInTime: true, checkOutTime: true, cancelledAt: true,
} as const;

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
    prismaPool[3].settings.upsert({ where: { ownerId: ownerId! }, update: {}, create: { ownerId: ownerId! }, select: { monthlyRevenueTargetPerUnit: true } }),
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
  const data: any = await cachedFetchRevenueGoalsData(user.role, user.ownedUnitIds, user.ownerId, (filters.unitIds ?? []).join(","));
  if (!hasActiveBookingFilters(extraFiltersOf(filters))) return data;
  const extra = extraFiltersOf(filters);
  return { ...data, bookingsThisMonth: applyBookingFilters(data.bookingsThisMonth, extra) as any[], bookingsLastMonth: applyBookingFilters(data.bookingsLastMonth, extra) as any[] };
}

// ---------------------------------------------------------------------
// Forecast & Predictive Analytics — the new section. Two deliberately
// different scopes coexist here, same split RevenueGoalsSection already
// established elsewhere on this page:
//   - The Monthly Forecast Summary/Pace/Scenarios/Target (sections 1-3, 11
//     of the brief this was built from) are always the real CURRENT
//     calendar month, independent of whatever period preset is selected —
//     "this month's target" isn't something that should shift if someone
//     picks "This Week" elsewhere on the page.
//   - Day-of-week/Unit/Booker/Source breakdowns and Insights follow the
//     selected filter period (date range + unit + booker + platform + stay
//     type + status), per section 16's explicit requirement.
// Unit actuals are NOT re-fetched/re-computed here — getUnitPerformance is
// called directly and its rows fed into forecastByUnit, so the Unit
// Forecast table can never disagree with the existing Unit Performance
// section for the exact same real numbers (section 18's "one calculation,
// one source of truth").
// ---------------------------------------------------------------------

const forecastBookingSelect = {
  id: true, unitId: true, bookerId: true, stayType: true, platform: true, date: true, checkOutDate: true,
  amount: true, paid: true, dpAmount: true, cancelledAt: true, refundedAt: true, checkInTime: true, checkOutTime: true,
} as const;

async function fetchForecastData(
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

  const { current: periodRange, previous: previousPeriodRange } = resolveAnalyticsPeriod(preset, { start: customStart, end: customEnd });
  const monthRange = periodRangeFor("monthly", 0);
  const trailingMonths = [3, 2, 1].map((n) => periodRangeFor("monthly", -n));
  const now = manilaNowPlaceholder();

  const [
    units, employees, settings, monthBookings, periodBookings, previousPeriodBookings, paidBillsThisMonth,
    salaryHistory, weeklyExpensesThisMonth, expenseRequestsThisMonth, maintenanceBlocksRemaining,
    ...trailingMonthResults
  ] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true, name: true, shortName: true, unitNumber: true, rating: true, monthlyRevenueTargetOverride: true } }),
    prismaPool[1].employee.findMany({ where: { ownerId, active: true }, select: { id: true, name: true } }),
    prismaPool[2].settings.upsert({ where: { ownerId: ownerId! }, update: {}, create: { ownerId: ownerId! } }),
    prismaPool[3].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: monthRange.start, lt: monthRange.end } }, select: forecastBookingSelect }),
    prismaPool[4].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: periodRange.start, lt: periodRange.end } }, select: forecastBookingSelect }),
    prismaPool[5].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: previousPeriodRange.start, lt: previousPeriodRange.end } }, select: forecastBookingSelect }),
    prismaPool[6].bill.findMany({ where: { ...billUnitWhere, paid: true, paidAt: { gte: monthRange.start, lt: monthRange.end } }, select: { amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } }),
    prismaPool[7].salaryHistory.findMany({ select: { employeeId: true, monthlySalary: true, effectiveDate: true } }),
    prismaPool[8].weeklyExpense.findMany({ where: { ownerId, category: "TIKTOK_ADS", date: { gte: monthRange.start, lt: monthRange.end } }, select: { category: true, amount: true } }),
    prismaPool[9].expenseRequest.findMany({ where: { status: "APPROVED", date: { gte: monthRange.start, lt: monthRange.end }, employee: { ownerId } }, select: { category: true, amount: true, status: true } }),
    // Only maintenance blocks still ahead (now -> month end) — this feeds
    // remainingAvailableNights, not a historical figure.
    prismaPool[10].calendarBlock.findMany({
      where: { ...bookingUnitWhere, type: "Maintenance", date: { lt: monthRange.end }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
      select: { unitId: true, date: true, endDate: true },
    }),
    ...trailingMonths.map(async (range, i) => {
      const tBookings = await prismaPool[(11 + i) % 13].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: range.start, lt: range.end } }, select: forecastBookingSelect });
      return { bookings: tBookings, start: range.start, end: range.end };
    }),
  ]);

  return JSON.parse(JSON.stringify({
    units, employees, monthlyRevenueTargetPerUnit: settings.monthlyRevenueTargetPerUnit,
    monthBookings, periodBookings, previousPeriodBookings, paidBillsThisMonth, salaryHistory, weeklyExpensesThisMonth, expenseRequestsThisMonth,
    maintenanceBlocksRemaining, trailingMonthResults,
    monthStart: monthRange.start, monthEnd: monthRange.end, periodStart: periodRange.start, periodEnd: periodRange.end,
    previousPeriodStart: previousPeriodRange.start, previousPeriodEnd: previousPeriodRange.end, now,
  }));
}

const cachedFetchForecastData = unstable_cache(fetchForecastData, ["analytics-forecast"], { revalidate: 60 });

export type ForecastAnalytics = {
  summary: MonthlyForecastSummary;
  weekdayRows: WeekdayRow[];
  unitRows: UnitForecastRow[];
  bookerRows: BookerForecastRow[];
  sourceRows: SourceForecastRow[];
  insights: ForecastInsight[];
  historicalComparison: {
    label: string;
    revenueGrowthPct: number | null;
    bookingsGrowthPct: number | null;
    occupancyGrowthPct: number | null;
    adrGrowthPct: number | null;
    netProfitGrowthPct: number | null;
  };
  // Section 6 — Revenue Metrics (ADR/RevPAR/etc): Actual (this period so
  // far) | Historical Average (trailing 3 months) | Forecast (elapsed-frac
  // blend of the two, same blend methodology as computeMonthlyForecastSummary
  // uses for revenue — never a separately-invented projection method).
  revenueMetrics: {
    adrPesos: { actual: number; historicalAvg: number; forecast: number };
    revparPesos: { actual: number; historicalAvg: number; forecast: number };
    revenuePerUnitPesos: { actual: number; forecast: number };
    revenuePerBookingPesos: { actual: number; forecast: number };
  };
  // Section 4 — Booking Forecast: same Actual/Confirmed/Forecast/Projected
  // split as the revenue summary, applied to booking COUNT instead of
  // pesos, using the identical daysElapsed/daysRemaining pace blend.
  bookingForecast: { actualBookings: number; confirmedBookings: number; forecastAdditionalBookings: number; projectedTotalBookings: number };
};

export async function getForecastAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<ForecastAnalytics> {
  const data: any = await cachedFetchForecastData(
    user.role, user.ownedUnitIds, user.ownerId, filters.preset, filters.customStart ?? "", filters.customEnd ?? "", (filters.unitIds ?? []).join(",")
  );
  const extra = extraFiltersOf(filters);
  const units: { id: string; name: string; shortName: string; unitNumber: string; rating: number; monthlyRevenueTargetOverride: number | null }[] = data.units;
  const employees: { id: string; name: string }[] = data.employees;
  const monthBookings = applyBookingFilters(data.monthBookings, extra) as ForecastBooking[];
  const periodBookings = applyBookingFilters(data.periodBookings, extra) as ForecastBooking[];
  const previousPeriodBookings = applyBookingFilters(data.previousPeriodBookings, extra) as ForecastBooking[];
  const trailingMonthResults: { bookings: ForecastBooking[]; start: string; end: string }[] = data.trailingMonthResults.map((r: any) => ({ ...r, bookings: applyBookingFilters(r.bookings, extra) }));

  const now = new Date(data.now);
  const monthStart = new Date(data.monthStart);
  const monthEnd = new Date(data.monthEnd);
  const periodStart = new Date(data.periodStart);
  const periodEnd = new Date(data.periodEnd);
  const unitCount = units.length;

  const targetPesos = units.reduce((s, u) => s + (u.monthlyRevenueTargetOverride ?? data.monthlyRevenueTargetPerUnit), 0);

  // Real accrued net profit so far this month — same
  // accruedOperationalCostsCentavos formula Dashboard/Executive KPIs
  // already use, not a second expense model.
  const elapsedMonthBookings = elapsedBookings(monthBookings, monthEnd, now);
  const actualRevenueCentavosSoFar = collectedRevenueCentavos(elapsedMonthBookings);
  const paidExpensesCents = paidExpensesCentavos(data.paidBillsThisMonth);
  const accruedCosts = accruedOperationalCostsCentavos({
    employees: [], // payroll isn't unit-filtered/booking-filtered — omitted here to avoid double-fetching the full employee/salary set just for this one margin-rate input; paid Bills + ad/expense accruals still capture the real cash-cost signal this margin rate needs
    salaryHistory: data.salaryHistory,
    weeklyExpenses: data.weeklyExpensesThisMonth,
    expenseRequests: data.expenseRequestsThisMonth,
    periodStart: monthStart,
    periodEnd: monthEnd,
    now,
  });
  const currentMonthNetProfitSoFarCentavos = netProfitCentavos({ revenueCentavos: actualRevenueCentavosSoFar, paidExpensesCentavos: paidExpensesCents, otherPaidCostsCentavos: accruedCosts });

  const trailingMonthRevenuePesos = trailingMonthResults.map((r) => collectedRevenueCentavos(r.bookings) / 100);
  const trailingMonthBookingCounts = trailingMonthResults.map((r) => r.bookings.filter((b) => !b.cancelledAt).length);
  const trailingMonthOccupancyPct = trailingMonthResults.map(
    (r) => computeOccupancy({ unitCount, periodStart: new Date(r.start), periodEnd: new Date(r.end), bookings: r.bookings as any, maintenanceBlocks: [], cleaningBlocks: [] }).occupancyPct
  );
  const actualOccupancyPctSoFar = computeOccupancy({ unitCount, periodStart: monthStart, periodEnd: now, bookings: elapsedMonthBookings as any, maintenanceBlocks: [], cleaningBlocks: [] }).occupancyPct;
  const maintenanceNightsRemaining = computeOccupancy({ unitCount, periodStart: now, periodEnd: monthEnd, bookings: [], maintenanceBlocks: data.maintenanceBlocksRemaining, cleaningBlocks: [] }).maintenanceNights;
  const cancellationRatePct = cancellationRate(monthBookings);

  const summary = computeMonthlyForecastSummary({
    currentMonthBookings: monthBookings, now, monthStart, monthEnd, targetPesos, unitCount, maintenanceNightsRemaining,
    trailingMonthRevenuePesos, trailingMonthBookingCounts, trailingMonthOccupancyPct, cancellationRatePct,
    currentMonthNetProfitSoFarCentavos, actualOccupancyPctSoFar,
  });

  const periodDays = daysInRange({ start: periodStart, end: periodEnd });
  const daysElapsed = Math.min(periodDays, Math.max(1, Math.floor((Math.min(now.getTime(), periodEnd.getTime()) - periodStart.getTime()) / 86400000) + 1));

  const weekdayRows = forecastByDayOfWeek(periodBookings as any, unitCount, periodStart, periodEnd);

  const unitPerf = await getUnitPerformance(user, filters);
  const lastPeriodRevenueByUnit: Record<string, number> = {};
  for (const b of previousPeriodBookings) {
    if (b.cancelledAt) continue;
    lastPeriodRevenueByUnit[b.unitId] = (lastPeriodRevenueByUnit[b.unitId] ?? 0) + collectedAmountCentavosSafe(b);
  }
  const unitRows = forecastByUnit(unitPerf.rows, lastPeriodRevenueByUnit, daysElapsed, periodDays);

  const lastPeriodRevenueByBooker: Record<string, number> = {};
  for (const b of previousPeriodBookings) {
    if (b.cancelledAt || !b.bookerId) continue;
    lastPeriodRevenueByBooker[b.bookerId] = (lastPeriodRevenueByBooker[b.bookerId] ?? 0) + collectedAmountCentavosSafe(b);
  }
  const bookerRows = forecastByBooker(employees.map((e) => ({ employeeId: e.id, name: e.name })), periodBookings, lastPeriodRevenueByBooker, daysElapsed, periodDays);

  const lastPeriodRevenueBySource: Record<string, number> = {};
  for (const b of previousPeriodBookings) {
    if (b.cancelledAt) continue;
    lastPeriodRevenueBySource[b.platform] = (lastPeriodRevenueBySource[b.platform] ?? 0) + collectedAmountCentavosSafe(b);
  }
  const sourceRows = forecastBySource(periodBookings as any, lastPeriodRevenueBySource, daysElapsed, periodDays);

  const insights = generateForecastInsights({ summary, weekdayRows, unitRows, bookerRows });

  const periodRevenueCentavos = collectedRevenueCentavos(periodBookings);
  const previousRevenueCentavos = collectedRevenueCentavos(previousPeriodBookings);
  const periodBookingCount = periodBookings.filter((b) => !b.cancelledAt).length;
  const previousBookingCount = previousPeriodBookings.filter((b) => !b.cancelledAt).length;
  const previousPeriodStart = new Date(data.previousPeriodStart);
  const previousPeriodEnd = new Date(data.previousPeriodEnd);
  const periodOcc = computeOccupancy({ unitCount, periodStart, periodEnd, bookings: periodBookings as any, maintenanceBlocks: [], cleaningBlocks: [] });
  const previousOcc = computeOccupancy({ unitCount, periodStart: previousPeriodStart, periodEnd: previousPeriodEnd, bookings: previousPeriodBookings as any, maintenanceBlocks: [], cleaningBlocks: [] });
  const periodAdr = computeADR(periodBookings as any, periodStart, periodEnd);
  const previousAdr = computeADR(previousPeriodBookings as any, previousPeriodStart, previousPeriodEnd);
  const periodNetProfitCentavos = netProfitCentavos({ revenueCentavos: periodRevenueCentavos, paidExpensesCentavos: 0 });
  const previousNetProfitCentavos = netProfitCentavos({ revenueCentavos: previousRevenueCentavos, paidExpensesCentavos: 0 });

  // Revenue Metrics (section 6) — trailing-month ADR/RevPAR computed from
  // the same trailingMonthResults bookings already fetched for the summary
  // engine, not a second fetch.
  const trailingAdrs = trailingMonthResults.map((r) => computeADR(r.bookings as any, new Date(r.start), new Date(r.end)));
  const trailingRevpars = trailingMonthResults.map((r) => {
    const occ = computeOccupancy({ unitCount, periodStart: new Date(r.start), periodEnd: new Date(r.end), bookings: r.bookings as any, maintenanceBlocks: [], cleaningBlocks: [] });
    return computeRevPAR(collectedRevenueCentavos(r.bookings), occ.availableNights);
  });
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const historicalAdr = avg(trailingAdrs);
  const historicalRevpar = avg(trailingRevpars);
  const elapsedFrac = periodDays > 0 ? Math.min(1, daysElapsed / periodDays) : 1;
  const forecastAdr = Math.round(periodAdr * elapsedFrac + historicalAdr * (1 - elapsedFrac));
  const periodRevpar = computeRevPAR(periodRevenueCentavos, periodOcc.availableNights);
  const forecastRevpar = Math.round(periodRevpar * elapsedFrac + historicalRevpar * (1 - elapsedFrac));
  const revenuePerUnitActual = unitCount > 0 ? Math.round(periodRevenueCentavos / 100 / unitCount) : 0;
  const revenuePerBookingActual = periodBookingCount > 0 ? Math.round(periodRevenueCentavos / 100 / periodBookingCount) : 0;
  const projectedRevenuePesos = summary.projectedRevenueCentavos / 100;
  const revenuePerUnitForecast = unitCount > 0 ? Math.round(projectedRevenuePesos / unitCount) : 0;
  const forecastBookingCount = Math.max(periodBookingCount, Math.round(periodBookingCount / Math.max(elapsedFrac, 0.01)));
  const revenuePerBookingForecast = forecastBookingCount > 0 ? Math.round(projectedRevenuePesos / forecastBookingCount) : 0;

  // Booking Forecast (section 4) — mirrors the revenue Actual/Confirmed/
  // Forecast split exactly, on booking count instead of pesos, using the
  // same summary.pace.daysElapsed/daysRemaining this month's revenue split
  // already computed (no second period-math model).
  const actualBookingsCount = elapsedMonthBookings.filter((b) => !b.cancelledAt).length;
  const confirmedBookingsCount = monthBookings.filter((b) => !b.cancelledAt && new Date(b.date).getTime() >= now.getTime() && new Date(b.date).getTime() < monthEnd.getTime()).length;
  const bookingDailyPace = summary.pace.daysElapsed > 0 ? actualBookingsCount / summary.pace.daysElapsed : 0;
  const forecastAdditionalBookings = Math.round(bookingDailyPace * summary.pace.daysRemaining);
  const projectedTotalBookings = actualBookingsCount + confirmedBookingsCount + forecastAdditionalBookings;

  return {
    summary, weekdayRows, unitRows, bookerRows, sourceRows, insights,
    historicalComparison: {
      label: `${formatDateRangeShort(periodStart, new Date(periodEnd.getTime() - 86400000))} vs previous period`,
      revenueGrowthPct: revenueGrowthPct(periodRevenueCentavos, previousRevenueCentavos),
      bookingsGrowthPct: revenueGrowthPct(periodBookingCount * 100, previousBookingCount * 100), // reused as a generic %-change helper (100x scale cancels out)
      occupancyGrowthPct: previousOcc.occupancyPct > 0 ? Math.round(((periodOcc.occupancyPct - previousOcc.occupancyPct) / previousOcc.occupancyPct) * 100) : null,
      adrGrowthPct: previousAdr > 0 ? Math.round(((periodAdr - previousAdr) / previousAdr) * 100) : null,
      netProfitGrowthPct: revenueGrowthPct(periodNetProfitCentavos, previousNetProfitCentavos),
    },
    revenueMetrics: {
      adrPesos: { actual: periodAdr, historicalAvg: Math.round(historicalAdr), forecast: forecastAdr },
      revparPesos: { actual: periodRevpar, historicalAvg: Math.round(historicalRevpar), forecast: forecastRevpar },
      revenuePerUnitPesos: { actual: revenuePerUnitActual, forecast: revenuePerUnitForecast },
      revenuePerBookingPesos: { actual: revenuePerBookingActual, forecast: revenuePerBookingForecast },
    },
    bookingForecast: { actualBookings: actualBookingsCount, confirmedBookings: confirmedBookingsCount, forecastAdditionalBookings, projectedTotalBookings },
  };
}

function collectedAmountCentavosSafe(b: ForecastBooking): number {
  if (b.refundedAt) return 0;
  return ((b.paid ? b.amount : 0) + (b.dpAmount || 0)) * 100;
}

// ---------------------------------------------------------------------
// Income vs Expenses / Profitability Intelligence — always the real
// current/previous CALENDAR MONTH, same fixed-month convention
// getRevenueGoalsData already uses (Bills/RecurringExpenseTemplate are
// themselves generated per calendar month, so a P&L/break-even/waterfall
// view tied to an arbitrary date-range preset would mix a partial-month
// expense picture with whatever range happens to be selected). Booker/
// Platform/Stay Type/Status filters still apply (post-fetch, same as
// every other section) — only the DATE RANGE preset doesn't drive this
// section's scope.
// ---------------------------------------------------------------------

const profitabilityBookingSelect = {
  id: true, unitId: true, bookerId: true, stayType: true, platform: true, date: true, checkOutDate: true,
  amount: true, paid: true, dpAmount: true, cancelledAt: true, cancellationCategory: true, refundedAt: true,
  originalAmount: true, couponDiscountAmount: true, checkInTime: true, checkOutTime: true,
} as const;

const profitabilityBillSelect = { key: true, unitId: true, paid: true, amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true } as const;

async function fetchProfitabilityData(role: string, ownedUnitIds: string[], ownerId: string | null, filterUnitIdsJoined: string) {
  const user = { role, ownedUnitIds, ownerId };
  const filterUnitIds = filterUnitIdsJoined ? filterUnitIdsJoined.split(",") : null;
  const effective = await effectiveUnitIds(user, filterUnitIds);
  const unitIdWhere = effective ? { id: { in: effective } } : {};
  const bookingUnitWhere = effective ? { unitId: { in: effective } } : {};
  const billUnitWhere = effective ? { unitId: { in: effective } } : {};

  const month = periodRangeFor("monthly", 0);
  const previousMonth = periodRangeFor("monthly", -1);
  const now = manilaNowPlaceholder();

  const [
    units, employees, settings,
    monthBookings, previousMonthBookings,
    monthBills, previousMonthBills,
    monthWeeklyExpenses, previousMonthWeeklyExpenses,
    monthExpenseRequests, previousMonthExpenseRequests,
    salaryHistory,
  ] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere, select: { id: true, name: true, shortName: true, unitNumber: true, rating: true } }),
    prismaPool[1].employee.findMany({ where: { ownerId, active: true }, select: { id: true, name: true, role: true, monthlySalary: true, active: true } }),
    prismaPool[2].settings.upsert({ where: { ownerId: ownerId! }, update: {}, create: { ownerId: ownerId! } }),
    prismaPool[3].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: month.start, lt: month.end } }, select: profitabilityBookingSelect }),
    prismaPool[4].booking.findMany({ where: { ...bookingUnitWhere, date: { gte: previousMonth.start, lt: previousMonth.end } }, select: profitabilityBookingSelect }),
    prismaPool[5].bill.findMany({ where: { ...billUnitWhere, month: month.start }, select: profitabilityBillSelect }),
    prismaPool[6].bill.findMany({ where: { ...billUnitWhere, month: previousMonth.start }, select: profitabilityBillSelect }),
    prismaPool[7].weeklyExpense.findMany({ where: { ownerId, date: { gte: month.start, lt: month.end } }, select: { category: true, amount: true, targetEmployeeId: true } }),
    prismaPool[8].weeklyExpense.findMany({ where: { ownerId, date: { gte: previousMonth.start, lt: previousMonth.end } }, select: { category: true, amount: true, targetEmployeeId: true } }),
    prismaPool[9].expenseRequest.findMany({ where: { status: { not: "REJECTED" }, date: { gte: month.start, lt: month.end }, employee: { ownerId } }, select: { category: true, amount: true, status: true } }),
    prismaPool[10].expenseRequest.findMany({ where: { status: { not: "REJECTED" }, date: { gte: previousMonth.start, lt: previousMonth.end }, employee: { ownerId } }, select: { category: true, amount: true, status: true } }),
    prismaPool[11].salaryHistory.findMany({ select: { employeeId: true, monthlySalary: true, effectiveDate: true } }),
  ]);

  return JSON.parse(JSON.stringify({
    units, employees, bookerCommissionPesos: settings.bookerCommission,
    monthBookings, previousMonthBookings, monthBills, previousMonthBills,
    monthWeeklyExpenses, previousMonthWeeklyExpenses, monthExpenseRequests, previousMonthExpenseRequests, salaryHistory,
    monthStart: month.start, monthEnd: month.end, previousMonthStart: previousMonth.start, previousMonthEnd: previousMonth.end, now,
  }));
}

const cachedFetchProfitabilityData = unstable_cache(fetchProfitabilityData, ["analytics-profitability"], { revalidate: 60 });

export type ProfitabilityAnalytics = {
  income: IncomeBreakdown;
  expense: ExpenseBreakdown;
  profitViews: ThreeProfitViews;
  waterfall: WaterfallStep[];
  breakEven: BreakEvenResult;
  contributionByUnit: ContributionRow[];
  contributionBySource: ContributionRow[];
  contributionByStayType: ContributionRow[];
  unitEconomics: UnitEconomicsRow[];
  bookerProfitability: BookerProfitRow[];
  sourceProfitability: SourceProfitRow[];
  healthVerdict: HealthVerdict;
  redFlags: RedFlag[];
  brutalTruths: BrutalTruth[];
  statusQuoProjection: StatusQuoProjection[];
  topActions: ActionRecommendation[];
  revenueGrowthPct: number | null;
  expenseGrowthPct: number | null;
  marginTrendPct: number | null;
  discountToGrossPct: number;
  topSourceRevenueSharePct: number;
  targetProbabilityPct: number | null;
};

export async function getProfitabilityAnalytics(user: { role: string; ownedUnitIds: string[]; ownerId: string | null }, filters: AnalyticsFilters): Promise<ProfitabilityAnalytics> {
  const data: any = await cachedFetchProfitabilityData(user.role, user.ownedUnitIds, user.ownerId, (filters.unitIds ?? []).join(","));
  const extra = extraFiltersOf(filters);
  const units: { id: string; name: string; shortName: string; unitNumber: string; rating: number }[] = data.units;
  const employees: { id: string; name: string; role: string; monthlySalary: number; active: boolean }[] = data.employees;
  const monthBookings = applyBookingFilters(data.monthBookings, extra) as ProfitBooking[];
  const previousMonthBookings = applyBookingFilters(data.previousMonthBookings, extra) as ProfitBooking[];
  const bookerCommissionPesos: number = data.bookerCommissionPesos;

  const monthStart = new Date(data.monthStart);
  const monthEnd = new Date(data.monthEnd);
  const previousMonthStart = new Date(data.previousMonthStart);
  const previousMonthEnd = new Date(data.previousMonthEnd);
  const now = new Date(data.now);
  const unitCount = units.length;

  // Forecast's own already-computed month summary — reused directly for
  // Confirmed/Forecast income and target probability, never recomputed.
  const forecastAnalytics = await getForecastAnalytics(user, filters);
  const summary = forecastAnalytics.summary;

  const income = computeIncomeBreakdown(monthBookings, summary);
  const expense = computeExpenseBreakdown({
    bills: data.monthBills, weeklyExpenses: data.monthWeeklyExpenses, expenseRequests: data.monthExpenseRequests,
    employees,
    salaryHistory: data.salaryHistory, bookings: monthBookings, bookerCommissionPesos,
    periodStart: monthStart, periodEnd: monthEnd, now,
  });
  const profitViews = computeThreeProfitViews(income, expense);
  const waterfall = computeWaterfall(income, expense);

  const daysInMonth = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000));
  const daysElapsed = Math.min(daysInMonth, Math.max(1, Math.floor((now.getTime() - monthStart.getTime()) / 86400000) + 1));
  const elapsedFrac = daysElapsed / daysInMonth;

  const bookingCount = monthBookings.filter((b) => !b.cancelledAt).length;
  const availableNights = unitCount * daysInMonth;
  const currentAdrCentavos = bookingCount > 0 ? Math.round(income.grossRevenueCentavos / bookingCount / (income.grossRevenueCentavos > 0 ? 1 : 1)) : 0;
  const totalVariableCostsCentavos = expense.variable.totalCentavos + expense.payroll.bookerCommissionsCentavos;
  const totalFixedCostsCentavos = expense.fixed.totalCentavos + expense.payroll.salaryCentavos;

  const breakEven = computeBreakEven({
    fixedCostsCentavos: totalFixedCostsCentavos,
    totalVariableCostsCentavos,
    bookingCount,
    grossRevenueCentavos: income.grossRevenueCentavos,
    unitCount,
    availableNights,
    currentAdrCentavos: (() => {
      const nights = monthBookings.filter((b) => !b.cancelledAt).length;
      return nights > 0 ? Math.round(income.grossRevenueCentavos / nights) : currentAdrCentavos;
    })(),
  });

  const dimensionBookings = monthBookings as any;
  const contributionByUnit = computeContributionByDimension(dimensionBookings, "unit", totalVariableCostsCentavos, bookingCount, Object.fromEntries(units.map((u) => [u.id, formatUnitDisplay(u.unitNumber, u.shortName)])));
  const contributionBySource = computeContributionByDimension(dimensionBookings, "source", totalVariableCostsCentavos, bookingCount);
  const contributionByStayType = computeContributionByDimension(dimensionBookings, "stayType", totalVariableCostsCentavos, bookingCount);

  const monthUnitRows = unitPerformance(units, monthBookings as any, data.monthBills, [], [], monthStart, monthEnd);
  const sharedCostsCentavos = totalFixedCostsCentavos + expense.variable.marketingCentavos + expense.variable.operationalCentavos + expense.payroll.bookerCommissionsCentavos;
  const unitEconomics = computeUnitEconomics(monthUnitRows, monthBookings, sharedCostsCentavos, monthStart, monthEnd);

  const bookerProfitability = computeBookerProfitability(employees.map((e) => ({ employeeId: e.id, name: e.name })), monthBookings, bookerCommissionPesos);
  const sourceProfitability = computeSourceProfitability(dimensionBookings, totalVariableCostsCentavos, bookingCount);

  // Growth comparisons — previous month computed fully-elapsed (now =
  // previousMonthEnd), current month's revenue uses the Forecast engine's
  // own full-month PROJECTION (not a second projection model) so a
  // partial-month actual isn't compared against a full prior month.
  const previousExpense = computeExpenseBreakdown({
    bills: data.previousMonthBills, weeklyExpenses: data.previousMonthWeeklyExpenses, expenseRequests: data.previousMonthExpenseRequests,
    employees,
    salaryHistory: data.salaryHistory, bookings: previousMonthBookings, bookerCommissionPesos,
    periodStart: previousMonthStart, periodEnd: previousMonthEnd, now: previousMonthEnd,
  });
  const previousIncome = computeIncomeBreakdown(previousMonthBookings, { confirmedFutureRevenueCentavos: 0, forecastAdditionalRevenueCentavos: 0 });
  const previousProfitViews = computeThreeProfitViews(previousIncome, previousExpense);
  const projectedExpenseCentavos = elapsedFrac > 0 ? expense.totalAccruedCentavos / elapsedFrac : expense.totalAccruedCentavos;

  const revGrowth = revenueGrowthPct(summary.projectedRevenueCentavos, previousIncome.collectedRevenueCentavos);
  const expGrowth = revenueGrowthPct(Math.round(projectedExpenseCentavos), previousExpense.totalAccruedCentavos);
  const marginTrendPct = profitViews.operatingMarginPct - previousProfitViews.operatingMarginPct;

  const discountToGrossPct = income.grossRevenueCentavos > 0 ? Math.round((income.discountGivenCentavos / income.grossRevenueCentavos) * 100) : 0;
  const totalSourceRevenue = sourceProfitability.reduce((s, r) => s + r.grossRevenueCentavos, 0);
  const topSourceRevenueSharePct = totalSourceRevenue > 0 ? Math.round((Math.max(...sourceProfitability.map((r) => r.grossRevenueCentavos), 0) / totalSourceRevenue) * 100) : 0;

  const underperformingUnits = unitEconomics.filter((u) => u.fullyLoadedMarginPct < 5).map((u) => formatUnitDisplay(u.unitNumber, u.name));
  const lowProfitHighVolumeBookers = bookerProfitability.filter((b) => b.volumeVsProfitFlag === "high_volume_low_profit").map((b) => b.name);
  const lowContributionHighRevenueSources = sourceProfitability.filter((s) => s.revenueRank <= 2 && s.revenueRank < s.profitRank).map((s) => s.source);

  const healthVerdict = computeBusinessHealthVerdict({
    operatingMarginPct: profitViews.operatingMarginPct,
    economicMarginPct: profitViews.economicMarginPct,
    revenueGrowthPct: revGrowth,
    expenseGrowthPct: expGrowth,
    occupancyPct: summary.projectedOccupancyPct,
    breakEvenOccupancyPct: breakEven.breakEvenOccupancyPct,
    cancellationRatePct: cancellationRate(monthBookings),
    fixedCostToRevenuePct: income.grossRevenueCentavos > 0 ? Math.round((totalFixedCostsCentavos / income.grossRevenueCentavos) * 100) : 0,
  });

  const redFlags = computeRedFlags({
    revenueGrowthPct: revGrowth,
    expenseGrowthPct: expGrowth,
    marginTrendPct,
    operatingProfitCentavos: profitViews.operatingProfitCentavos,
    economicProfitCentavos: profitViews.economicProfitCentavos,
    occupancyPct: summary.projectedOccupancyPct,
    breakEvenOccupancyPct: breakEven.breakEvenOccupancyPct,
    adrCentavos: breakEven.breakEvenAdrCentavos,
    breakEvenAdrCentavos: breakEven.breakEvenAdrCentavos,
    topSourceRevenueSharePct,
    cancellationRatePct: cancellationRate(monthBookings),
    utilityToRevenuePct: income.grossRevenueCentavos > 0 ? Math.round(((expense.variable.electricityCentavos + expense.variable.waterCentavos) / income.grossRevenueCentavos) * 100) : 0,
    payrollToRevenuePct: income.grossRevenueCentavos > 0 ? Math.round((expense.payroll.totalCentavos / income.grossRevenueCentavos) * 100) : 0,
    discountToGrossPct,
    fixedCostToRevenuePct: income.grossRevenueCentavos > 0 ? Math.round((totalFixedCostsCentavos / income.grossRevenueCentavos) * 100) : 0,
    targetProbabilityPct: summary.targetProbabilityPct,
    projectedRevenueBelowBreakEven: summary.projectedRevenueCentavos < breakEven.breakEvenRevenueCentavos,
    underperformingUnits,
    lowProfitHighVolumeBookers,
    lowContributionHighRevenueSources,
  });

  const worst = [...unitEconomics].sort((a, b) => a.fullyLoadedMarginPct - b.fullyLoadedMarginPct)[0] ?? null;
  const brutalTruths = generateBrutalTruths({
    revenueGrowthPct: revGrowth,
    operatingMarginPct: profitViews.operatingMarginPct,
    previousOperatingMarginPct: previousProfitViews.operatingMarginPct,
    occupancyPct: summary.projectedOccupancyPct,
    breakEvenOccupancyPct: breakEven.breakEvenOccupancyPct,
    adrCentavos: breakEven.breakEvenAdrCentavos,
    breakEvenAdrCentavos: breakEven.breakEvenAdrCentavos,
    worstUnitLabel: worst ? formatUnitDisplay(worst.unitNumber, worst.name) : null,
    worstUnitMarginPct: worst ? worst.fullyLoadedMarginPct : null,
    expenseGrowthPct: expGrowth,
    fixedCostToRevenuePct: income.grossRevenueCentavos > 0 ? Math.round((totalFixedCostsCentavos / income.grossRevenueCentavos) * 100) : 0,
  });

  const dailyRevenueCentavos = daysElapsed > 0 ? income.collectedRevenueCentavos / daysElapsed : 0;
  const dailyExpenseCentavos = daysElapsed > 0 ? expense.totalAccruedCentavos / daysElapsed : 0;
  const statusQuoProjection = computeStatusQuoProjection(dailyRevenueCentavos, dailyExpenseCentavos);

  const weekdayRows = forecastByDayOfWeek(monthBookings as any, unitCount, monthStart, monthEnd);
  const weekend = weekdayRows.filter((r) => r.dow === 0 || r.dow === 6);
  const weekday = weekdayRows.filter((r) => r.dow >= 1 && r.dow <= 5);
  const weekendOccupancyPct = weekend.length > 0 ? Math.round(weekend.reduce((s, r) => s + r.occupancyPct, 0) / weekend.length) : 0;
  const weekdayOccupancyPct = weekday.length > 0 ? Math.round(weekday.reduce((s, r) => s + r.occupancyPct, 0) / weekday.length) : 0;
  const worstSource = [...sourceProfitability].sort((a, b) => a.contributionMarginPct - b.contributionMarginPct)[0] ?? null;

  const topActions = computeTopActions({
    weekendOccupancyPct, weekdayOccupancyPct,
    weekdayAvailableNightsPerMonth: Math.round(unitCount * daysInMonth * (5 / 7)),
    adrCentavos: breakEven.breakEvenAdrCentavos,
    occupiedNightsPerMonth: monthUnitRows.reduce((s, u) => s + Math.round((u.occupancyPct / 100) * daysInMonth), 0),
    operationalCentavosPerBooking: bookingCount > 0 ? Math.round(expense.variable.operationalCentavos / bookingCount) : 0,
    bookingsPerMonth: bookingCount,
    cancellationRatePct: cancellationRate(monthBookings),
    cancelledBookingsPerMonth: monthBookings.filter((b) => b.cancelledAt).length,
    worstSourceLabel: worstSource?.source ?? null,
    worstSourceContributionMarginPct: worstSource?.contributionMarginPct ?? null,
    worstSourceRevenueCentavos: worstSource?.grossRevenueCentavos ?? null,
  });

  return {
    income, expense, profitViews, waterfall, breakEven,
    contributionByUnit, contributionBySource, contributionByStayType,
    unitEconomics, bookerProfitability, sourceProfitability,
    healthVerdict, redFlags, brutalTruths, statusQuoProjection, topActions,
    revenueGrowthPct: revGrowth, expenseGrowthPct: expGrowth, marginTrendPct,
    discountToGrossPct, topSourceRevenueSharePct, targetProbabilityPct: summary.targetProbabilityPct,
  };
}
