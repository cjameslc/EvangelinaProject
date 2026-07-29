"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { RevenueGoalsPanel } from "@/components/shared/RevenueGoalsPanel";
import { useRevenueGoalsPanelData } from "@/components/shared/useRevenueGoalsPanelData";
import type { SalaryHistoryEntry } from "@/lib/payroll";
import { manilaDayKey as dayOf } from "@/lib/analytics/period";
import type { OccupancyBlock } from "@/lib/analytics/occupancy";
import type { Unit, Booking, Employee, Bill, HkState, WeeklyExpenseRow, AttentionFinding, Stock } from "./types";
import { useUnitStatus } from "./hooks/useUnitStatus";
import { useBillsSummary } from "./hooks/useBillsSummary";
import { useBatteryHealth } from "./hooks/useBatteryHealth";
import { useReserveCodeStats } from "./hooks/useReserveCodeStats";
import { useMonthlyProfitSummary } from "./hooks/useMonthlyProfitSummary";
import { useEarningsData } from "./hooks/useEarningsData";
import { EarningsSection } from "./sections/EarningsSection";
import { KeyMetricsSection } from "./sections/KeyMetricsSection";
import { StayMixSection } from "./sections/StayMixSection";
import { NeedsAttentionSection } from "./sections/NeedsAttentionSection";
import { BatteryHealthSection } from "./sections/BatteryHealthSection";
import { EmergencyAccessCodesSection } from "./sections/EmergencyAccessCodesSection";
import { YourListingsSection } from "./sections/YourListingsSection";
import { UpcomingExpensesSection } from "./sections/UpcomingExpensesSection";

export function DashboardView({
  role,
  units,
  bookingsWeek,
  bookingsMonth,
  employees,
  bills,
  hkStates,
  earningsBookings,
  weeklyExpenses,
  attentionFindings,
  stocks,
  salaryHistory,
  expenseRequestsMonth,
  cleaningLogsRecent,
  calendarBlocksOccupancy,
  reserveAccessCodes,
  ttlockStatus,
  bookingsPrevMonth,
  monthlyRevenueTargetPerUnit,
  batteryLowThresholdPct,
  batteryCriticalThresholdPct,
  pendingGuestRequests,
  weekRangeStart,
  weekRangeEnd,
  monthRangeStart,
  monthRangeEnd,
  dismissedAttentionKeys,
  airbnbHistoricalMonthly,
}: {
  role: string;
  units: Unit[];
  bookingsWeek: Booking[];
  bookingsMonth: Booking[];
  bookingsPrevMonth: Booking[];
  monthlyRevenueTargetPerUnit: number;
  employees: Employee[];
  bills: Bill[];
  hkStates: HkState[];
  earningsBookings: Booking[];
  weeklyExpenses: WeeklyExpenseRow[];
  attentionFindings: AttentionFinding[];
  salaryHistory: SalaryHistoryEntry[];
  stocks: Stock[];
  expenseRequestsMonth: { id: string; category: string; amount: number; status: string; date: string; employee: { name: string } | null }[];
  cleaningLogsRecent: { id: string; unitId: string; startedAt: string; endedAt: string | null; employee: { name: string } | null }[];
  calendarBlocksOccupancy: OccupancyBlock[];
  reserveAccessCodes: { unitId: string; status: string }[];
  ttlockStatus: { lastSuccessAt: string | null; lastFailureAt: string | null; lastFailureMessage: string | null } | null;
  batteryLowThresholdPct: number;
  batteryCriticalThresholdPct: number;
  pendingGuestRequests: { id: string; type: string; message: string | null; priority: string; photoUrl: string | null; createdAt: string; unit: { shortName: string } | null; guest: { name: string | null; email: string } | null }[];
  weekRangeStart: string;
  weekRangeEnd: string;
  monthRangeStart: string;
  monthRangeEnd: string;
  dismissedAttentionKeys: string[];
  /** Airbnb's own officially-reported monthly totals (pesos), keyed
   * "YYYY-MM" — covers Feb 2025 through Mar 2026, i.e. mostly months
   * before this app tracked any bookings itself. Used only as a
   * record-keeping fallback in the Earnings card's Monthly view: when the
   * app has zero tracked income for a selected month, this fills in the
   * real historical figure instead of showing ₱0. Never touches a month
   * the app already has real tracked income for. */
  airbnbHistoricalMonthly?: Record<string, number>;
}) {
  const { data: session } = useSession();
  const name = session?.user?.name?.split(" ")[0] ?? "there";

  // Business runs in Manila (UTC+8) — computed once here and threaded down
  // as a plain string into every hook that needs "today," rather than each
  // file independently calling `new Date()`.
  const todayIso = dayOf(new Date());

  const { unitStatus, statusCategory } = useUnitStatus({ hkStates, bookingsWeek, todayIso });
  const { billMeta, dueDateFor, dueBills, overdueCentavos, billsDueMonthCentavos, billsPaidMonthCentavos, billsDueMonth, billsPaidMonth } = useBillsSummary({ bills, todayIso });
  const { batteryTier, lockedUnits, batteryStats, upcomingCheckinRiskUnits } = useBatteryHealth({ units, bookingsWeek, batteryLowThresholdPct, batteryCriticalThresholdPct });
  const reserveCodeStats = useReserveCodeStats({ reserveAccessCodes, units });

  const {
    monthIncome,
    completedMonthIncome,
    expectedMonthIncome,
    monthlyStaffSalary,
    accruedStaffSalary,
    upcomingStaffSalary,
    netProfitCents,
    netProfitRaw,
    netProfit,
    marginRaw,
    margin,
    cashFlowRaw,
    cashFlow,
    forecastProfitCents,
    forecastProfit,
  } = useMonthlyProfitSummary({
    bookingsMonth,
    employees,
    salaryHistory,
    weeklyExpenses,
    expenseRequestsMonth,
    billsDueMonthCentavos,
    billsPaidMonthCentavos,
    todayIso,
  });

  const stayCounts = useMemo(() => {
    const c: Record<string, number> = { Daycation: 0, Night: 0, Full: 0 };
    bookingsWeek.forEach((b) => { if (c[b.stayType] !== undefined) c[b.stayType]++; });
    return c;
  }, [bookingsWeek]);
  const stayTotal = stayCounts.Daycation + stayCounts.Night + stayCounts.Full || 1;

  // Earnings period filter — Weekly/Monthly/Yearly, an optional single day,
  // and unit status. Declared here (rather than down by the Earnings card
  // itself) because "Your team" below reads the same rangeType/periodRange,
  // so both cards always agree on what period is selected.
  // Defaults to "monthly", not "weekly" — this drives the Key metrics
  // card's Occupancy/RevPAR/ADR (see filteredOccupancyData below), which
  // sits in the same card as Realized/Forecast Profit, Margin, and Cash
  // Flow — all four of which are always "this month" regardless of this
  // filter (see the comment on filteredOccupancyData for why). A "weekly"
  // default silently showed a different period than the rest of that same
  // card, and than Analytics' own default "This Month" view — a real,
  // confirmed discrepancy (e.g. Occupancy showing 69% here vs Analytics'
  // 76% for what looked like "the same" current state, simply because one
  // was a 7-day window and the other was the full month). The underlying
  // period filter itself is a real, deliberate feature (staff can still
  // switch to daily/weekly/yearly/custom) — only the out-of-the-box
  // default was misleading.
  const {
    rangeType, setRangeType,
    periodOffset, setPeriodOffset,
    customRange, setCustomRange,
    selectedDate, setSelectedDate,
    statusFilter, setStatusFilter,
    resetFilters,
    periodRange,
    periodLabel,
    periodDays,
    periodPhrase,
    periodPhraseCap,
    filteredUnits,
    periodBookings,
    periodIncome,
    historicalIncome,
    displayedPeriodIncome,
    filteredOccupancyData,
    filteredOccupancy,
    filteredRevpar,
    filteredAdr,
    previousPeriodIncome,
    periodTrendPct,
    earningsBuckets,
    avgStayNights,
    platformBreakdown,
    periodSalary,
    periodStartIso,
    periodEndIso,
  } = useEarningsData({
    units,
    earningsBookings,
    statusCategory,
    employees,
    salaryHistory,
    calendarBlocksOccupancy,
    airbnbHistoricalMonthly,
  });

  const { unitGoals, revenueGoalPortfolio, revenueGoalMilestones, revenueGoalLeaderboard, bookerContribution } = useRevenueGoalsPanelData({
    role,
    units,
    bookingsMonth,
    bookingsPrevMonth,
    monthlyRevenueTargetPerUnit,
    monthRangeStart,
    monthRangeEnd,
    employees,
    currentUserId: session?.user?.id,
  });

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">
            Welcome back, {name} <span className="ml-1 rounded-full bg-amber/15 px-2.5 py-1 text-[12px] font-bold text-amber align-middle">★ Superhost</span>
          </h1>
          <p className="mt-1 text-[15px] text-[var(--gray)]">Here&rsquo;s how your {units.length} stays in Cubao are performing.</p>
        </div>
      </div>

      <RevenueGoalsPanel
        portfolio={revenueGoalPortfolio}
        unitGoals={unitGoals}
        milestones={revenueGoalMilestones}
        leaderboard={revenueGoalLeaderboard}
        bookerContribution={bookerContribution}
      />

      <EarningsSection
        rangeType={rangeType} setRangeType={setRangeType}
        periodOffset={periodOffset} setPeriodOffset={setPeriodOffset}
        customRange={customRange} setCustomRange={setCustomRange}
        selectedDate={selectedDate} setSelectedDate={setSelectedDate}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        resetFilters={resetFilters}
        periodLabel={periodLabel}
        periodBookings={periodBookings}
        periodIncome={periodIncome}
        historicalIncome={historicalIncome}
        displayedPeriodIncome={displayedPeriodIncome}
        previousPeriodIncome={previousPeriodIncome}
        periodTrendPct={periodTrendPct}
        earningsBuckets={earningsBuckets}
        avgStayNights={avgStayNights}
        platformBreakdown={platformBreakdown}
        periodSalary={periodSalary}
        periodStartIso={periodStartIso}
        periodEndIso={periodEndIso}
        units={units}
        bookingsMonth={bookingsMonth}
        employees={employees}
        monthRangeStart={monthRangeStart}
        monthRangeEnd={monthRangeEnd}
        calendarBlocksOccupancy={calendarBlocksOccupancy}
        unitStatus={unitStatus}
        todayIso={todayIso}
        monthIncome={monthIncome}
        expectedMonthIncome={expectedMonthIncome}
        billsPaidMonthCentavos={billsPaidMonthCentavos}
        billsDueMonthCentavos={billsDueMonthCentavos}
        overdueCentavos={overdueCentavos}
        accruedStaffSalary={accruedStaffSalary}
        upcomingStaffSalary={upcomingStaffSalary}
        netProfit={netProfit}
        forecastProfit={forecastProfit}
        margin={margin}
        cashFlow={cashFlow}
        dueBills={dueBills}
        billMeta={billMeta}
      />

      <KeyMetricsSection
        netProfit={netProfit}
        netProfitRaw={netProfitRaw}
        forecastProfit={forecastProfit}
        margin={margin}
        marginRaw={marginRaw}
        cashFlow={cashFlow}
        cashFlowRaw={cashFlowRaw}
        filteredOccupancy={filteredOccupancy}
        filteredRevpar={filteredRevpar}
        filteredAdr={filteredAdr}
        filteredUnitCount={filteredUnits.length}
        periodPhrase={periodPhrase}
        periodPhraseCap={periodPhraseCap}
        overdueCentavos={overdueCentavos}
        billsDueMonthCentavos={billsDueMonthCentavos}
        billsPaidMonthCentavos={billsPaidMonthCentavos}
        monthlyStaffSalary={monthlyStaffSalary}
        completedMonthIncome={completedMonthIncome}
        forecastProfitCents={forecastProfitCents}
        monthIncome={monthIncome}
        bookingsMonth={bookingsMonth}
        units={units}
        weekRangeStart={weekRangeStart}
        weekRangeEnd={weekRangeEnd}
        bookingsWeek={bookingsWeek}
        calendarBlocksOccupancy={calendarBlocksOccupancy}
      />

      <StayMixSection stayCounts={stayCounts} stayTotal={stayTotal} />

      <NeedsAttentionSection
        attentionFindings={attentionFindings}
        units={units}
        bookingsWeek={bookingsWeek}
        bookingsMonth={bookingsMonth}
        hkStates={hkStates}
        cleaningLogsRecent={cleaningLogsRecent}
        stocks={stocks}
        expenseRequestsMonth={expenseRequestsMonth}
        pendingGuestRequests={pendingGuestRequests}
        dueBills={dueBills}
        dueDateFor={dueDateFor}
        billMeta={billMeta}
        batteryStats={batteryStats}
        lockedUnits={lockedUnits}
        batteryTier={batteryTier}
        upcomingCheckinRiskUnits={upcomingCheckinRiskUnits}
        reserveCodeStats={reserveCodeStats}
        dismissedAttentionKeys={dismissedAttentionKeys}
        todayIso={todayIso}
      />

      <BatteryHealthSection
        lockedUnits={lockedUnits}
        batteryStats={batteryStats}
        batteryLowThresholdPct={batteryLowThresholdPct}
        batteryCriticalThresholdPct={batteryCriticalThresholdPct}
      />

      <EmergencyAccessCodesSection reserveCodeStats={reserveCodeStats} ttlockStatus={ttlockStatus} />

      <YourListingsSection units={units} bookingsWeek={bookingsWeek} unitStatus={unitStatus} batteryTier={batteryTier} />

      <UpcomingExpensesSection
        dueBills={dueBills}
        dueDateFor={dueDateFor}
        billMeta={billMeta}
        billsPaidMonthCentavos={billsPaidMonthCentavos}
        billsDueMonthCentavos={billsDueMonthCentavos}
        overdueCentavos={overdueCentavos}
        todayIso={todayIso}
      />
    </div>
  );
}
