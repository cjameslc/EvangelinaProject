"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { Pill } from "@/components/ui/Pill";
import { peso, fmtDate, pesoCentavos, billCentavos, billPaidCentavos } from "@/lib/format";
import { STAY_TYPES, BILL_TYPES, LOW_STOCK_THRESHOLD, PLATFORMS, PLATFORM_LABEL } from "@/lib/constants";
import { attentionKey } from "@/lib/attentionKey";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, ArrowLeftIcon, FilterIcon, FileSpreadsheetIcon, FilePdfIcon, ChevronDownIcon, CheckIcon } from "@/components/ui/Icons";
import { nightsFor } from "@/lib/stayRange";
import { totalSalaryPayroll, type DashboardPeriodType, type SalaryHistoryEntry } from "@/lib/payroll";
import { paidExpensesCentavos, pendingExpensesCentavos, netProfitCentavos as computeNetProfitCentavos, marginPct, cashFlowCentavos } from "@/lib/finance";
import { periodRangeFor, previousPeriodRangeFor } from "@/lib/analytics/period";
import { computeOccupancy, computeADR, computeRevPAR, type OccupancyBlock } from "@/lib/analytics/occupancy";

type Unit = {
  id: string; name: string; shortName: string; unitNumber: string; nightlyRate: number; rating: number; photoUrl: string | null; location: string;
  owners?: { user: { name: string } }[]; icalLastSyncError?: string | null;
  ttlockLockId?: number | null; ttlockBatteryPct?: number | null; ttlockHasGateway?: boolean | null; ttlockBatterySyncedAt?: string | null;
};
type Booking = { id: string; unitId: string; unit?: Unit; date: string; checkOutDate: string | null; checkOutTime: string | null; stayType: string; platform: string; amount: number; paid: boolean; dpAmount: number | null; guests: string[]; receivedById: string | null; dpReceivedById: string | null; cleanerId: string | null; bookerId: string | null; conflict?: boolean; cancelledAt?: string | null; refundedAt?: string | null };
type Employee = { id: string; name: string; role: string; monthlySalary: number; active?: boolean };
type Bill = { id: string; unitId: string | null; key: string; label: string | null; month: string; dueDay: number | null; amountDue: number; amountPaid: number | null; amountDueCentavos?: number | null; amountPaidCentavos?: number | null; paid: boolean; unit: Unit | null };
type HkState = { unitId: string; status: string; unit: Unit; cleanedBookingIds?: string[] };
type WeeklyExpenseRow = { id: string; date: string; createdAt?: string; amount: number; note: string; category?: "GENERAL" | "TIKTOK_ADS"; targetEmployee: Employee | null; addedBy: { id: string; name: string } | null };

// "Needs your attention" card — a lightweight cross-section of open Auditor
// findings, this week's due bills, and low stock. Not the full records (the
// Auditor page / Housekeeping page own those), just enough to flag them here.
type AttentionFinding = {
  id: string; title: string; notes: string | null; recommendedAction: string | null;
  category: string; severity: "Critical" | "Warning"; unit: { shortName: string } | null; employee: { name: string } | null;
};
type Stock = { id: string; unitId: string; name: string; count: number };

// Business runs in Manila (UTC+8) — always bucket "today"/period boundaries by
// the Manila calendar date, not the server or browser's own timezone.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Money actually in hand right now for this booking — the full amount once
// paid, plus any downpayment on file, minus anything since given back. A
// cancelled booking's kept deposit still counts (same "money kept, not
// refunded" rule the commission engine uses — see isCommissionEligible in
// @/lib/bookingStatus); only a refund zeroes it out. Single source of truth
// for every revenue figure below instead of repeating this formula per card.
function collectedAmount(b: Booking): number {
  if (b.refundedAt) return 0;
  return (b.paid ? b.amount : 0) + (b.dpAmount || 0);
}

type RangeType = DashboardPeriodType;
type StatusFilter = "all" | "occupied" | "reserved" | "cleaning" | "available";

// periodRangeFor/previousPeriodRangeFor now live in src/lib/analytics/period.ts
// (shared with the Analytics module, so the two pages can't compute
// different period boundaries for the same rangeType/offset).

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
  batteryLowThresholdPct,
  batteryCriticalThresholdPct,
  pendingGuestRequests,
  weekRangeStart,
  weekRangeEnd,
  monthRangeStart,
  monthRangeEnd,
  dismissedAttentionKeys,
}: {
  role: string;
  units: Unit[];
  bookingsWeek: Booking[];
  bookingsMonth: Booking[];
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
}) {
  const { data: session } = useSession();
  const name = session?.user?.name?.split(" ")[0] ?? "there";
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set(dismissedAttentionKeys));

  async function dismissItem(key: string) {
    setDismissedKeys((prev) => new Set(prev).add(key));
    try {
      await fetch("/api/attention/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    } catch {
      // Best-effort — it'll just reappear on next load if this failed, not worth surfacing an error for.
    }
  }

  // Only count the remaining-balance amount once it's actually paid — an
  // unpaid balance isn't collected revenue yet, same convention already
  // used by periodIncome/monthlyPayroll/perUnitMonthlyEarned below. The
  // downpayment is always counted since logging a DP receipt means it's
  // already in hand.
  const income = useMemo(
    () => bookingsWeek.reduce((sum, b) => sum + collectedAmount(b), 0),
    [bookingsWeek]
  );
  const monthIncome = useMemo(
    () => bookingsMonth.reduce((sum, b) => sum + collectedAmount(b), 0),
    [bookingsMonth]
  );
  // A booking's stay counts as "completed" once its checkout has passed —
  // same rule the Elite Booker Challenge uses (src/lib/gamification.ts,
  // duplicated here rather than imported since that module pulls in the
  // server-only Prisma client). Realized profit below only ever counts
  // revenue from stays that have actually happened, not future reservations
  // just because a downpayment came in.
  const isCompletedStay = (b: Booking) => {
    const end = new Date(b.checkOutDate ?? b.date);
    return end.getTime() <= Date.now();
  };
  const completedMonthIncome = useMemo(
    () => bookingsMonth.filter(isCompletedStay).reduce((sum, b) => sum + collectedAmount(b), 0),
    [bookingsMonth]
  );
  // Full booked value of every reservation this month, completed or not —
  // "if everything gets collected as booked," the ceiling Forecast profit
  // measures against.
  const expectedMonthIncome = useMemo(
    () => bookingsMonth.reduce((sum, b) => sum + b.amount, 0),
    [bookingsMonth]
  );
  // Centavo-precise (recurring-expense templates carry real cents, e.g.
  // ₱18,300.26) — summed here, then only rounded to whole pesos at the very
  // end for display, so the cents aren't lost partway through Net
  // Profit/Cash Flow/Margin's arithmetic below. billsDueMonthCentavos is
  // "Pending" money — informational only (shown in Upcoming expenses), and
  // must never be subtracted from a profit/cash-flow figure; see
  // src/lib/finance.ts for the single place that rule lives.
  const billsDueMonthCentavos = useMemo(() => pendingExpensesCentavos(bills), [bills]);
  const billsPaidMonthCentavos = useMemo(() => paidExpensesCentavos(bills), [bills]);
  const billsDueMonth = Math.round(billsDueMonthCentavos / 100);
  const billsPaidMonth = Math.round(billsPaidMonthCentavos / 100);

  // This calendar month's start, as the reference point for looking up
  // each staff member's historically-effective salary (not necessarily
  // their current rate, if it changed mid-month).
  const thisMonthStart = useMemo(() => {
    const [y, m] = dayOf(new Date()).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }, []);
  const monthlyStaffSalary = useMemo(
    () => totalSalaryPayroll(employees, salaryHistory, "monthly", thisMonthStart),
    [employees, salaryHistory, thisMonthStart]
  );
  // Payroll has no separate "marked paid" flag (unlike Bills) — instead it's
  // treated as accrued day by day through the month, same as how a salary
  // actually earns out. Deducting the FULL month's salary from day 1 (the
  // previous behavior) is what made Net Profit look deeply negative at the
  // start of every month even though most of that salary hadn't been earned
  // yet. accruedStaffSalary is what's actually owed for the days elapsed so
  // far; upcomingStaffSalary is the rest of the month's obligation, not yet
  // due.
  const daysElapsedThisMonth = useMemo(() => Number(dayOf(new Date()).slice(8, 10)), []);
  const accruedStaffSalary = useMemo(
    () => totalSalaryPayroll(employees, salaryHistory, "custom", thisMonthStart, daysElapsedThisMonth),
    [employees, salaryHistory, thisMonthStart, daysElapsedThisMonth]
  );
  const upcomingStaffSalary = Math.max(0, monthlyStaffSalary - accruedStaffSalary);

  // TikTok Ads is a pure operational expense — deducted from Realized profit
  // like a paid bill, but never touches anyone's payroll (it's always
  // untargeted, enforced server-side too). Logged/edited from Admin's
  // Weekly report tab now, not here — this is just the month total still
  // needed for the profit calc below.
  const thisMonthIsoForAds = dayOf(new Date()).slice(0, 7);
  const tikTokAdsMonthTotal = useMemo(
    () => weeklyExpenses.filter((e) => e.category === "TIKTOK_ADS" && e.date.slice(0, 7) === thisMonthIsoForAds).reduce((s, e) => s + e.amount, 0),
    [weeklyExpenses, thisMonthIsoForAds]
  );

  // Employee-submitted expense requests (TikTok ads / unit expenses not
  // otherwise covered) — approved ones are already-real money, same
  // treatment as the Admin-logged TikTok ad spend above; pending ones are
  // a possible future cost, folded into Forecast only, never Realized.
  // Rejected ones (excluded from the server query entirely) never count.
  const approvedExpenseRequestsMonthTotal = useMemo(
    () => expenseRequestsMonth.filter((e) => e.status === "APPROVED").reduce((s, e) => s + e.amount, 0),
    [expenseRequestsMonth]
  );
  const pendingExpenseRequestsMonthTotal = useMemo(
    () => expenseRequestsMonth.filter((e) => e.status === "PENDING").reduce((s, e) => s + e.amount, 0),
    [expenseRequestsMonth]
  );
  // Feeds "Needs your attention" — every pending expense request waiting on
  // an owner decision in My Earnings' approval queue. Empty list = no item
  // pushed at all, same convention as every other automated check here.
  const pendingExpenseRequests = useMemo(
    () => expenseRequestsMonth.filter((e) => e.status === "PENDING"),
    [expenseRequestsMonth]
  );

  // Feeds "Needs your attention" — a clean marked done 10 minutes or less
  // after being started. Not proof anything's wrong (a small Daycation
  // turnover unit can genuinely be quick), just worth a glance — flags,
  // never blocks or auto-penalizes.
  const quickCleans = useMemo(
    () =>
      cleaningLogsRecent
        .filter((c) => c.endedAt)
        .map((c) => ({ ...c, minutes: Math.round((new Date(c.endedAt!).getTime() - new Date(c.startedAt).getTime()) / 60000) }))
        .filter((c) => c.minutes >= 0 && c.minutes <= 10),
    [cleaningLogsRecent]
  );

  // Realized vs Forecast — the two figures replace the old single "Net
  // profit," which mixed money already earned/spent with money that was
  // merely expected/upcoming and could look deeply negative for no real
  // reason early in a month.
  //
  // Realized profit = revenue from stays that actually happened, minus
  // expenses actually paid, minus payroll actually accrued to date. Only
  // ever reflects money that has genuinely moved. All in centavos through
  // the subtraction itself, so a recurring expense's cents are actually
  // reflected — only the final StatCard values round to whole pesos.
  const realizedCostsCentavos = accruedStaffSalary * 100 + tikTokAdsMonthTotal * 100 + approvedExpenseRequestsMonthTotal * 100;
  const netProfitCents = computeNetProfitCentavos({
    revenueCentavos: completedMonthIncome * 100,
    paidExpensesCentavos: billsPaidMonthCentavos,
    otherPaidCostsCentavos: realizedCostsCentavos,
  });
  // Always floored at ₱0 for display — this business never wants to see a
  // negative headline number here, whether that's because no stays have
  // completed yet or because accrued costs genuinely outpaced revenue this
  // period. The raw (possibly negative) figure still drives the amber
  // "caution" styling below, so a real loss period is still visually
  // flagged — it just never renders as a negative peso amount. The full
  // cost breakdown stays visible in the caption underneath either way.
  const netProfitRaw = Math.round(netProfitCents / 100);
  const netProfit = Math.max(0, netProfitRaw);
  const marginRaw = marginPct(netProfitCents, completedMonthIncome * 100);
  const margin = Math.max(0, marginRaw);
  // Cash flow stays revenue-in-hand (DP + collected balances, same as
  // before) since it's about money that's actually moved, not which stays
  // are done — but it now deducts only accrued payroll too, for the same
  // reason Realized profit does. Same always-floored display rule.
  const cashFlowRaw = Math.round(
    cashFlowCentavos({ revenueCentavos: monthIncome * 100, paidExpensesCentavos: billsPaidMonthCentavos, otherPaidCostsCentavos: realizedCostsCentavos }) / 100
  );
  const cashFlow = Math.max(0, cashFlowRaw);

  // Forecast profit = what the rest of this month still owes/expects:
  // every booking's full value (whether collected yet or not) minus bills
  // still outstanding minus payroll not yet accrued. A projection, not
  // actual money — shown with its own distinct styling so it's never
  // mistaken for Realized profit.
  const forecastProfitCents = computeNetProfitCentavos({
    revenueCentavos: expectedMonthIncome * 100,
    paidExpensesCentavos: billsDueMonthCentavos,
    otherPaidCostsCentavos: upcomingStaffSalary * 100 + pendingExpenseRequestsMonthTotal * 100,
  });
  const forecastProfit = Math.round(forecastProfitCents / 100);

  // Real occupied/available nights from actual date ranges (via
  // src/lib/analytics/occupancy.ts), not a flat booking-count/×7
  // approximation — a 3-night Full stay now correctly counts as 3 occupied
  // nights, and a unit under Maintenance no longer counts as "available".
  // weekRangeStart/End are the exact window the server fetched bookingsWeek
  // for, so this always matches what was actually queried.
  const weeklyOccupancy = useMemo(
    () =>
      computeOccupancy({
        unitCount: units.length,
        periodStart: new Date(weekRangeStart),
        periodEnd: new Date(weekRangeEnd),
        bookings: bookingsWeek,
        maintenanceBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Maintenance"),
        cleaningBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Cleaning"),
      }),
    [units.length, weekRangeStart, weekRangeEnd, bookingsWeek, calendarBlocksOccupancy]
  );
  const occupiedNights = weeklyOccupancy.occupiedNights;
  const availableNights = weeklyOccupancy.availableNights;
  const occupancy = weeklyOccupancy.occupancyPct;
  const revpar = computeRevPAR(income * 100, availableNights);
  const adr = useMemo(
    () => computeADR(bookingsWeek, new Date(weekRangeStart), new Date(weekRangeEnd)),
    [bookingsWeek, weekRangeStart, weekRangeEnd]
  );

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
  const [rangeType, setRangeType] = useState<RangeType>("weekly");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [earningsCollapsed, setEarningsCollapsed] = useState(false);
  const [periodNavOpen, setPeriodNavOpen] = useState(false);

  const periodRange = useMemo(
    () => periodRangeFor(rangeType, periodOffset, customRange),
    [rangeType, periodOffset, customRange]
  );
  // Whole days spanned by the period — used to prorate salary for "daily"
  // and "custom" ranges (weekly/monthly/yearly use their own fixed formula),
  // and to scale the Auditor's flat weekly rate in "Your team" below.
  const periodDays = Math.round((periodRange.end.getTime() - periodRange.start.getTime()) / 86400000);
  const periodLabel = useMemo(() => {
    if (rangeType === "daily") return fmtDate(periodRange.start, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
    if (rangeType === "weekly") {
      const lastDay = new Date(periodRange.end.getTime() - 86400000);
      return `${fmtDate(periodRange.start, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} – ${fmtDate(lastDay, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`;
    }
    if (rangeType === "monthly") return fmtDate(periodRange.start, { month: "long", year: "numeric", timeZone: "Asia/Manila" });
    if (rangeType === "custom") {
      const lastDay = new Date(periodRange.end.getTime() - 86400000);
      return `${fmtDate(periodRange.start, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} – ${fmtDate(lastDay, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`;
    }
    return fmtDate(periodRange.start, { year: "numeric", timeZone: "Asia/Manila" });
  }, [rangeType, periodRange]);
  // Same phrasing already used by the Earnings card's "You've earned ___"
  // line — reused here for the Key metrics tooltips so both cards describe
  // the selected period identically.
  const periodPhrase = rangeType === "daily" ? "today" : rangeType === "weekly" ? "this week" : rangeType === "monthly" ? "this month" : rangeType === "custom" ? "in this range" : "this year";
  const periodPhraseCap = rangeType === "daily" ? "Today" : rangeType === "weekly" ? "This week" : rangeType === "monthly" ? "This month" : rangeType === "custom" ? "This range" : "This year";

  const today = dayOf(new Date());
  function unitStatus(unit: Unit) {
    const hk = hkStates.find((h) => h.unitId === unit.id);
    if (hk?.status === "cleaning") return { label: "Cleaning", dot: "bg-teal" };
    const todays = bookingsWeek.find((b) => b.unitId === unit.id && dayOf(new Date(b.date)) === today);
    if (todays) return { label: "Occupied", dot: "bg-rausch" };
    const upcoming = bookingsWeek
      .filter((b) => b.unitId === unit.id && new Date(b.date) > new Date())
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
    if (upcoming) return { label: "Reserved", dot: "bg-amber" };
    return { label: "Available", dot: "bg-green" };
  }
  function statusCategory(unit: Unit): Exclude<StatusFilter, "all"> {
    const st = unitStatus(unit);
    if (st.label === "Cleaning") return "cleaning";
    if (st.label.startsWith("Occupied")) return "occupied";
    if (st.label.startsWith("Reserved")) return "reserved";
    return "available";
  }

  function billMeta(b: Bill) {
    const known = BILL_TYPES.find((t) => t.key === b.key);
    return { icon: known?.icon ?? "💳", label: b.label || known?.label || b.key, sub: known?.sub ?? "Custom bill" };
  }
  // Resolves a bill's dueDay (1-31) against its own billing month, clamped
  // to that month's real length (e.g. dueDay 31 in February -> Feb 28/29).
  // b.month is stored as a UTC instant representing Manila local midnight
  // (e.g. 2026-06-30T16:00:00Z = Jul 1 00:00 Manila) — reading it with
  // getUTCMonth() would misread it as June, so go through dayOf() like the
  // rest of this file does.
  function dueDateFor(b: Bill) {
    if (!b.dueDay) return null;
    const [my, mm] = dayOf(new Date(b.month)).split("-").map(Number);
    const lastDay = new Date(Date.UTC(my, mm, 0)).getUTCDate();
    return new Date(Date.UTC(my, mm - 1, Math.min(b.dueDay, lastDay)));
  }

  // Soonest due date first; bills with no due date set fall to the end.
  // Feeds the exported monthly report and the "needs attention" summary,
  // which both need the complete unpaid list, not just the near-term ones.
  const dueBills = [...bills.filter((b) => !b.paid)].sort((a, b) => {
    const da = dueDateFor(a);
    const db = dueDateFor(b);
    if (da && db) return da.getTime() - db.getTime();
    if (da) return -1;
    if (db) return 1;
    return 0;
  });

  const overdueCentavos = useMemo(() => {
    const todayDate = new Date(`${dayOf(new Date())}T00:00:00Z`);
    return dueBills.reduce((s, b) => {
      const d = dueDateFor(b);
      return d && d < todayDate ? s + billCentavos(b) : s;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueBills]);

  // Data-driven narrative for the Key metrics card — 2-4 sentences that
  // actually explain THIS month's numbers, in a fixed priority order
  // (overdue → break-even → bookings → occupancy → cash flow → forecast).
  // "Operating cost" here is the fixed monthly baseline (full staff salary
  // + this month's bills, paid and pending) — deliberately excludes
  // variable ad spend, since that's discretionary, not a fixed cost to
  // break even against.
  //
  // keyMetricsInsights (below) is the instant, always-available fallback —
  // rendered immediately and kept if the AI call below never lands.
  // insightMetricsPayload is the same underlying real numbers, reshaped for
  // the AI insight endpoint to phrase naturally instead of via fixed
  // templates — see the effect further down that POSTs this and upgrades
  // the displayed text in place once a response arrives.
  const { keyMetricsInsights, insightMetricsPayload } = useMemo(() => {
    const insights: string[] = [];
    const operatingCostCentavos = monthlyStaffSalary * 100 + billsPaidMonthCentavos + billsDueMonthCentavos;
    const futureScheduledCentavos = Math.max(0, billsDueMonthCentavos - overdueCentavos);
    const remainingToBreakEvenCentavos = Math.max(0, operatingCostCentavos - completedMonthIncome * 100);
    const coveragePct = operatingCostCentavos > 0 ? Math.min(100, Math.round((completedMonthIncome * 100 / operatingCostCentavos) * 100)) : 0;
    // Nothing completed yet, but most of this month's costs aren't even due
    // yet either — an empty-looking Realized profit here is just timing,
    // not a loss, so frame it that way rather than as a shortfall.
    const earlyMonth = completedMonthIncome === 0 && futureScheduledCentavos > overdueCentavos;

    // 1. Critical overdue payments
    if (overdueCentavos > 0) {
      insights.push(`${pesoCentavos(overdueCentavos)} of expenses are overdue and require immediate payment.`);
    }

    // 2. Break-even progress
    let breakEvenStatus: "early_month" | "no_completed_income" | "remaining" | "covered";
    if (earlyMonth) {
      breakEvenStatus = "early_month";
      insights.push("Most monthly operating expenses are scheduled for later this month. Current profit is expected to improve as more bookings are confirmed and completed.");
    } else if (completedMonthIncome === 0) {
      breakEvenStatus = "no_completed_income";
      insights.push("Realized profit is ₱0 because no stays have been completed yet during the selected period.");
    } else if (remainingToBreakEvenCentavos > 0) {
      breakEvenStatus = "remaining";
      insights.push(`${pesoCentavos(remainingToBreakEvenCentavos)} more revenue is needed to reach this month's break-even point.`);
    } else {
      breakEvenStatus = "covered";
      insights.push(`This month's operating costs are already fully covered — revenue is covering ${coveragePct}% of monthly operating costs.`);
    }

    // 3. Booking performance
    if (bookingsMonth.length > 0) {
      insights.push(`${bookingsMonth.length} booking${bookingsMonth.length === 1 ? "" : "s"} recorded this month, generating ${peso(completedMonthIncome)} in completed-stay revenue so far.`);
    }

    // 4. Occupancy trend
    insights.push(
      occupancy >= 70
        ? `Occupancy is ${occupancy}%, indicating strong booking performance.`
        : `Occupancy is ${occupancy}%, with availability remaining for additional bookings.`
    );

    // 5. Cash flow
    if (monthIncome === 0) {
      insights.push("Cash flow remains at ₱0 because guest payments have not yet been received.");
    }

    // 6. Forecast explanation — never frame this as a loss, just timing.
    if (forecastProfitCents < 0) {
      insights.push("Current bookings have not yet covered this month's operating costs. Forecast profit will update automatically as new bookings are added and completed.");
    }

    return {
      keyMetricsInsights: insights.slice(0, 4),
      insightMetricsPayload: {
        overdueAmount: overdueCentavos > 0 ? pesoCentavos(overdueCentavos) : null,
        breakEvenStatus,
        remainingToBreakEven: breakEvenStatus === "remaining" ? pesoCentavos(remainingToBreakEvenCentavos) : null,
        coveragePct: breakEvenStatus === "covered" ? coveragePct : null,
        bookingsCount: bookingsMonth.length,
        completedRevenue: peso(completedMonthIncome),
        occupancyPct: occupancy,
        cashFlowIsZero: monthIncome === 0,
        forecastIsNegative: forecastProfitCents < 0,
      },
    };
  }, [overdueCentavos, billsDueMonthCentavos, billsPaidMonthCentavos, monthlyStaffSalary, completedMonthIncome, forecastProfitCents, monthIncome, occupancy, bookingsMonth]);

  // Upgrades the fallback template text above with a naturally-phrased
  // Gemini summary of the exact same numbers — never a different set of
  // facts, just better prose. Fails silently to the fallback (never blocks
  // the page, never shows an error for a non-critical cosmetic upgrade).
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  useEffect(() => {
    setAiInsight(null);
    let cancelled = false;
    fetch("/api/dashboard/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(insightMetricsPayload),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => { if (!cancelled && j?.insight) setAiInsight(j.insight); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(insightMetricsPayload)]);

  // The "Upcoming expenses" widget only ever shows bills that are actually
  // overdue — "due soon" (not yet overdue) bills are intentionally left out
  // entirely, per an explicit ask to stop surfacing those and keep this
  // list focused on what genuinely needs action now. Oldest due date first,
  // since that's the most urgent. Bills with no due date set can't be
  // judged overdue, so they're left out of this widget.
  const upcomingExpenseBills = useMemo(() => {
    const todayIso = dayOf(new Date());
    const todayDate = new Date(`${todayIso}T00:00:00Z`);
    return dueBills
      .filter((b) => { const d = dueDateFor(b); return d && d < todayDate; })
      .sort((a, b) => dueDateFor(a)!.getTime() - dueDateFor(b)!.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueBills]);

  const [expenseDateFilter, setExpenseDateFilter] = useState<string | null>(null);
  const visibleDueBills = useMemo(() => {
    if (!expenseDateFilter) return upcomingExpenseBills;
    return upcomingExpenseBills.filter((b) => {
      const d = dueDateFor(b);
      return d && dayOf(d) === expenseDateFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingExpenseBills, expenseDateFilter]);
  // The footer total must equal exactly what's listed above it — summing
  // billsDueMonthCentavos here instead would silently include pending bills
  // that aren't overdue yet (and so never appear as a row in this table),
  // making the total look wrong next to what's actually visible.
  const visibleDueBillsCentavos = useMemo(() => visibleDueBills.reduce((s, b) => s + billCentavos(b), 0), [visibleDueBills]);

  // "Needs your attention" — cross-section of open Auditor findings,
  // overdue bills, and low stock. Purely a summary; each source's own page
  // (Auditor / Housekeeping) still owns the full record. Only genuinely
  // overdue bills are flagged here — "due soon" bills aren't surfaced.
  const overdueBillsForAttention = dueBills.filter((b) => {
    const d = dueDateFor(b);
    return d && d < new Date(`${dayOf(new Date())}T00:00:00Z`);
  });
  const lowStock = stocks.filter((s) => s.count <= LOW_STOCK_THRESHOLD);

  // bookingsWeek already covers "the last 7 days through any future date"
  // (no upper bound — see dashboard/page.tsx); bookingsMonth adds back the
  // earlier part of the current calendar month bookingsWeek would otherwise
  // miss. Deduped by id since a booking dated this month and within the
  // last 7 days appears in both. Feeds the conflict/unpaid-balance checks
  // below — a broader, still-cheap window than bookingsWeek alone, with no
  // extra query since both arrays are already fetched for other cards.
  const combinedRecentBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    [...bookingsWeek, ...bookingsMonth].forEach((b) => map.set(b.id, b));
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsWeek, bookingsMonth]);

  // An imported Airbnb booking that overlapped an existing manual one —
  // flagged, never auto-overwritten (see Booking.conflict's schema
  // comment). Today only a small "⚠️ Conflict" tag on the Bookings page
  // itself; easy to miss unless you're already looking at that exact row.
  const bookingConflicts = useMemo(() => combinedRecentBookings.filter((b) => b.conflict), [combinedRecentBookings]);

  // A unit whose Airbnb calendar sync last failed (Unit.icalLastSyncError
  // is cleared to null on the next successful sync, so this is always
  // "currently broken," never stale history) — today only visible by
  // opening Calendar's Sync History panel.
  const failedSyncUnits = useMemo(() => units.filter((u) => u.icalLastSyncError), [units]);

  // A completed stay whose remaining balance was never marked paid —
  // revenue that's stuck, not currently flagged anywhere.
  const unpaidAfterCheckout = useMemo(
    () => combinedRecentBookings.filter((b) => isCompletedStay(b) && !b.paid && b.amount > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combinedRecentBookings]
  );

  // Check-in already happened but the balance is still unpaid — same "⏰
  // Past due" tag now shown on the Bookings page. Excludes stays that have
  // already fully completed (checked out) since those are the more specific,
  // more urgent unpaidAfterCheckout case just above; a booking can't be in
  // both buckets at once.
  const pastDueBookings = useMemo(
    () => combinedRecentBookings.filter((b) => !isCompletedStay(b) && !b.paid && b.amount > 0 && dayOf(new Date(b.date)) < today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combinedRecentBookings]
  );

  // Late cleaning — a unit whose most recent checkout hasn't been cleaned
  // yet AND already has a future guest booked in, so whoever arrives next
  // is the one who'll notice if it slips. Checked against cleanedBookingIds
  // (not the coarse HousekeepingUnitState.status alone) — same rule the
  // Housekeeping page itself uses, since a same-day second checkout can
  // leave status reading "clean" from an earlier, already-finished one.
  // "Not yet started" excludes status "cleaning" — staff already on it
  // isn't late, just in progress.
  const lateCleaningUnits = useMemo(() => {
    const now = Date.now();
    const results: { unit: Unit; checkoutAt: Date; nextCheckInAt: Date }[] = [];
    for (const unit of units) {
      const unitBookings = bookingsWeek.filter((b) => b.unitId === unit.id);
      const hk = hkStates.find((h) => h.unitId === unit.id);
      const cleanedIds = hk?.cleanedBookingIds ?? [];
      const pendingCheckout = unitBookings
        .filter((b) => new Date(b.checkOutDate ?? b.date).getTime() <= now && !cleanedIds.includes(b.id))
        .sort((a, b) => +new Date(a.checkOutDate ?? a.date) - +new Date(b.checkOutDate ?? b.date))[0];
      if (!pendingCheckout || hk?.status === "cleaning") continue;
      const nextCheckIn = unitBookings
        .filter((b) => new Date(b.date).getTime() > now)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
      if (!nextCheckIn) continue;
      results.push({ unit, checkoutAt: new Date(pendingCheckout.checkOutDate ?? pendingCheckout.date), nextCheckInAt: new Date(nextCheckIn.date) });
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, bookingsWeek, hkStates]);

  // Smart Battery Health — tier classification uses the live, admin-editable
  // Settings thresholds (batteryLowThresholdPct/batteryCriticalThresholdPct),
  // not a hardcoded default — this is the one place in the app that actually
  // gates real alerts on them (Admin → Units' own badge intentionally stays
  // on the schema defaults, see that file's comment).
  function batteryTier(pct: number | null | undefined): "critical" | "low" | "healthy" | null {
    if (pct === null || pct === undefined) return null;
    if (pct <= batteryCriticalThresholdPct) return "critical";
    if (pct <= batteryLowThresholdPct) return "low";
    return "healthy";
  }
  const lockedUnits = useMemo(() => units.filter((u) => u.ttlockLockId != null), [units]);
  const batteryStats = useMemo(() => {
    let healthy = 0, low = 0, critical = 0, offline = 0, sum = 0, counted = 0;
    let lastUpdated: string | null = null;
    for (const u of lockedUnits) {
      if (u.ttlockHasGateway === false) offline++;
      const tier = batteryTier(u.ttlockBatteryPct);
      if (tier === "critical") critical++;
      else if (tier === "low") low++;
      else if (tier === "healthy") healthy++;
      if (typeof u.ttlockBatteryPct === "number") { sum += u.ttlockBatteryPct; counted++; }
      if (u.ttlockBatterySyncedAt && (!lastUpdated || u.ttlockBatterySyncedAt > lastUpdated)) lastUpdated = u.ttlockBatterySyncedAt;
    }
    return { healthy, low, critical, offline, average: counted > 0 ? Math.round(sum / counted) : null, lastUpdated };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedUnits, batteryLowThresholdPct, batteryCriticalThresholdPct]);

  // Cross-references battery health against the soonest future booking per
  // unit (same nextCheckIn lookup lateCleaningUnits already does above) — a
  // guest arriving within 48h at a unit whose lock is Low/Critical/offline
  // is a real risk of a failed check-in, worth a high-priority call-out
  // distinct from the general "battery is low" item.
  const upcomingCheckinRiskUnits = useMemo(() => {
    const now = Date.now();
    const in48h = now + 48 * 3600 * 1000;
    const results: { unit: Unit; nextCheckInAt: Date; tier: "critical" | "low" | "offline" }[] = [];
    for (const unit of lockedUnits) {
      const tier: "critical" | "low" | "offline" | null = unit.ttlockHasGateway === false ? "offline" : (batteryTier(unit.ttlockBatteryPct) === "critical" ? "critical" : batteryTier(unit.ttlockBatteryPct) === "low" ? "low" : null);
      if (!tier) continue;
      const nextCheckIn = bookingsWeek
        .filter((b) => b.unitId === unit.id && new Date(b.date).getTime() > now && new Date(b.date).getTime() <= in48h)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
      if (!nextCheckIn) continue;
      results.push({ unit, nextCheckInAt: new Date(nextCheckIn.date), tier });
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedUnits, bookingsWeek, batteryLowThresholdPct, batteryCriticalThresholdPct]);

  // Dashboard booking reads never include the `unit` relation (see
  // dashboard/page.tsx) — every place that needs a unit name off a booking
  // resolves it through the separately-fetched `units` array instead.
  const unitShortName = (unitId: string) => units.find((u) => u.id === unitId)?.shortName ?? "Unit";

  // Reserve access-code pool health, per unit — feeds both the "Emergency
  // Access Codes" widget below and the exhaustion attention item. A unit
  // with reserve codes provisioned but zero AVAILABLE means the very next
  // TTLock outage during a booking would leave a guest with no code at all.
  const reserveCodeStats = useMemo(() => {
    const byUnit = new Map<string, { total: number; available: number }>();
    for (const c of reserveAccessCodes) {
      const s = byUnit.get(c.unitId) ?? { total: 0, available: 0 };
      s.total++;
      if (c.status === "AVAILABLE") s.available++;
      byUnit.set(c.unitId, s);
    }
    const total = reserveAccessCodes.length;
    const available = reserveAccessCodes.filter((c) => c.status === "AVAILABLE").length;
    const exhaustedUnits = units.filter((u) => (byUnit.get(u.id)?.total ?? 0) > 0 && (byUnit.get(u.id)?.available ?? 0) === 0);
    return { byUnit, total, available, inUse: total - available, exhaustedUnits };
  }, [reserveAccessCodes, units]);

  const attentionItems = useMemo(() => {
    const items: { id: string; dot: string; title: string; desc: string; tag: string; href?: string }[] = [];

    // Auditor findings first — a real, human-flagged quality/safety concern
    // outranks the automated checks below.
    attentionFindings.forEach((f) => {
      items.push({
        id: f.id,
        dot: f.severity === "Critical" ? "bg-rausch" : f.severity === "Warning" ? "bg-amber" : "bg-blue",
        title: f.title,
        desc: f.notes || f.recommendedAction || `${f.unit?.shortName ?? "All units"}${f.employee ? ` · ${f.employee.name}` : ""}`,
        tag: "Auditor",
        href: "/auditor",
      });
    });

    // Upcoming check-in risk outranks the general battery items below — a
    // guest arriving within 48h at a Low/Critical/offline unit is the one
    // scenario that actually needs same-day action, not just "worth knowing."
    if (upcomingCheckinRiskUnits.length > 0) {
      upcomingCheckinRiskUnits.forEach((r) => {
        const hoursOut = Math.round((r.nextCheckInAt.getTime() - Date.now()) / 3600000);
        const when = hoursOut <= 24 ? "within 24 hours" : "within 48 hours";
        const batteryText = r.tier === "offline" ? "isn't reporting (offline)" : `is ${r.tier === "critical" ? "critically" : ""} low (${r.unit.ttlockBatteryPct}%)`;
        items.push({
          id: `attn-checkin-risk-${r.unit.id}`,
          dot: "bg-rausch",
          title: `Upcoming check-in risk — ${r.unit.shortName}`,
          desc: `A guest is arriving ${when} and this unit's lock ${batteryText}. Replace the battery or check its connection before they arrive.`,
          tag: "Locks",
          href: "/admin?tab=Units",
        });
      });
    }

    if (batteryStats.critical > 0) {
      const names = lockedUnits.filter((u) => batteryTier(u.ttlockBatteryPct) === "critical").map((u) => `${u.shortName} (${u.ttlockBatteryPct}%)`).join(", ");
      items.push({
        id: "attn-battery-critical",
        dot: "bg-rausch",
        title: `${batteryStats.critical} lock${batteryStats.critical === 1 ? "" : "s"} at critical battery`,
        desc: `${names} — replace immediately before the next guest arrives.`,
        tag: "Locks",
        href: "/admin?tab=Units",
      });
    }

    if (batteryStats.low > 0) {
      const names = lockedUnits.filter((u) => batteryTier(u.ttlockBatteryPct) === "low").map((u) => `${u.shortName} (${u.ttlockBatteryPct}%)`).join(", ");
      items.push({
        id: "attn-battery-low",
        dot: "bg-amber",
        title: `${batteryStats.low} lock${batteryStats.low === 1 ? "" : "s"} running low on battery`,
        desc: `${names} — schedule a replacement soon.`,
        tag: "Locks",
        href: "/admin?tab=Units",
      });
    }

    if (batteryStats.offline > 0) {
      const names = lockedUnits.filter((u) => u.ttlockHasGateway === false).map((u) => u.shortName).join(", ");
      items.push({
        id: "attn-battery-offline",
        dot: "bg-amber",
        title: `${batteryStats.offline} lock${batteryStats.offline === 1 ? "" : "s"} not reporting`,
        desc: `${names} — check the lock's WiFi/gateway connection; battery status may be stale.`,
        tag: "Locks",
        href: "/admin?tab=Units",
      });
    }

    if (reserveCodeStats.exhaustedUnits.length > 0) {
      const desc = reserveCodeStats.exhaustedUnits.map((u) => u.shortName).join(", ");
      items.push({
        id: "attn-reserve-codes-exhausted",
        dot: "bg-rausch",
        title: `No emergency access codes left for ${reserveCodeStats.exhaustedUnits.length === 1 ? "1 unit" : `${reserveCodeStats.exhaustedUnits.length} units`}`,
        desc: `${desc} — a TTLock outage during a booking right now would leave that guest without a door code. Release codes from finished stays or provision more.`,
        tag: "Locks",
      });
    }

    // Guest requests from the Digital Guidebook (housekeeping, late
    // checkout, extend stay, a reported issue) — time-sensitive, since a
    // guest is actively waiting on these, so each shows individually
    // rather than being rolled into one summary row like the checks below.
    const GUEST_REQUEST_LABEL: Record<string, string> = {
      housekeeping: "🧹 Housekeeping requested",
      late_checkout: "⏰ Late checkout requested",
      extend_stay: "📅 Stay extension requested",
      issue: "⚠️ Issue reported",
      other: "Guest request",
    };
    const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
    [...pendingGuestRequests]
      .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2))
      .forEach((r) => {
        const dot = r.priority === "urgent" ? "bg-rausch" : r.priority === "high" ? "bg-amber" : r.type === "issue" ? "bg-rausch" : "bg-blue";
        const priorityTag = r.priority === "urgent" ? "🔴 Urgent — " : r.priority === "high" ? "🟠 High priority — " : "";
        items.push({
          id: `guest-request-${r.id}`,
          dot,
          title: `${priorityTag}${GUEST_REQUEST_LABEL[r.type] ?? "Guest request"}`,
          desc: `${r.unit?.shortName ?? "Unit"} — ${r.guest?.name ?? r.guest?.email ?? "Guest"}${r.message ? `: "${r.message}"` : ""}${r.photoUrl ? " 📷 Photo attached" : ""}`,
          tag: "Guest",
        });
      });

    if (pendingExpenseRequests.length > 0) {
      const total = pendingExpenseRequests.reduce((s, e) => s + e.amount, 0);
      const desc = pendingExpenseRequests
        .map((e) => `${e.employee?.name ?? "Unknown"} — ${e.category === "TIKTOK_ADS" ? "TikTok Ads" : "Unit Expense"} (${peso(e.amount)})`)
        .join(", ");
      items.push({
        id: "attn-expense-requests",
        dot: "bg-amber",
        title: `${pendingExpenseRequests.length} expense request${pendingExpenseRequests.length === 1 ? "" : "s"} awaiting approval`,
        desc: `${peso(total)} total: ${desc}.`,
        tag: "Expenses",
        href: "/earnings",
      });
    }

    if (quickCleans.length > 0) {
      const desc = quickCleans
        .map((c) => `${c.employee?.name ?? "Unassigned"} — ${unitShortName(c.unitId)} (${c.minutes === 0 ? "instant" : `${c.minutes} min`})`)
        .join(", ");
      items.push({
        id: "attn-quick-cleans",
        dot: "bg-rausch",
        title: `${quickCleans.length} clean${quickCleans.length === 1 ? "" : "s"} marked done unusually fast`,
        desc: `Started and marked clean within 10 minutes — worth a second look: ${desc}.`,
        tag: "Housekeeping",
        href: "/housekeeping",
      });
    }

    if (lateCleaningUnits.length > 0) {
      const desc = lateCleaningUnits
        .map((u) => `${u.unit.shortName} — checked out ${fmtDate(u.checkoutAt, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}, next guest ${fmtDate(u.nextCheckInAt, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}`)
        .join("; ");
      items.push({
        id: "attn-late-cleaning",
        dot: "bg-rausch",
        title: `${lateCleaningUnits.length} unit${lateCleaningUnits.length === 1 ? "" : "s"} ${lateCleaningUnits.length === 1 ? "needs" : "need"} cleaning before the next guest`,
        desc,
        tag: "Housekeeping",
        href: "/housekeeping",
      });
    }

    if (bookingConflicts.length > 0) {
      const desc = bookingConflicts
        .map((b) => `${unitShortName(b.unitId)} (${fmtDate(b.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})`)
        .join(", ");
      items.push({
        id: "attn-conflicts",
        dot: "bg-rausch",
        title: `${bookingConflicts.length} booking conflict${bookingConflicts.length === 1 ? "" : "s"} need${bookingConflicts.length === 1 ? "s" : ""} review`,
        desc: `An imported Airbnb booking overlaps an existing one: ${desc}.`,
        tag: "Bookings",
        href: "/bookings",
      });
    }

    if (pastDueBookings.length > 0) {
      const total = pastDueBookings.reduce((s, b) => s + b.amount, 0);
      const desc = pastDueBookings
        .map((b) => `${unitShortName(b.unitId)} (${fmtDate(b.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})`)
        .join(", ");
      items.push({
        id: "attn-pastdue",
        dot: "bg-amber",
        title: `${peso(total)} past due — check-in already passed`,
        desc: `Balance still unpaid: ${desc}.`,
        tag: "Bookings",
        href: "/bookings",
      });
    }

    if (unpaidAfterCheckout.length > 0) {
      const total = unpaidAfterCheckout.reduce((s, b) => s + b.amount, 0);
      const desc = unpaidAfterCheckout
        .map((b) => `${unitShortName(b.unitId)} (${fmtDate(b.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})`)
        .join(", ");
      items.push({
        id: "attn-unpaid",
        dot: "bg-amber",
        title: `${peso(total)} unpaid after checkout`,
        desc: `Stay finished but the balance was never marked paid: ${desc}.`,
        tag: "Bookings",
        href: "/bookings",
      });
    }

    if (failedSyncUnits.length > 0) {
      const desc = failedSyncUnits.map((u) => u.shortName).join(", ");
      items.push({
        id: "attn-sync",
        dot: "bg-amber",
        title: `${failedSyncUnits.length} unit${failedSyncUnits.length === 1 ? "" : "s"} failed to sync with Airbnb`,
        desc: `${desc}. Retry the sync from the Calendar page.`,
        tag: "Calendar",
        href: "/calendar",
      });
    }

    if (overdueBillsForAttention.length > 0) {
      const totalCentavos = overdueBillsForAttention.reduce((s, b) => s + billCentavos(b), 0);
      const desc = overdueBillsForAttention
        .map((b) => {
          const d = dueDateFor(b);
          return `${billMeta(b).label}${d ? ` (${fmtDate(d, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})` : ""}`;
        })
        .join(", ");
      items.push({ id: "attn-bills", dot: "bg-rausch", title: `${pesoCentavos(totalCentavos)} in overdue bills`, desc: `${desc}. See Upcoming expenses below.`, tag: "Expenses" });
    }

    if (lowStock.length > 0) {
      items.push({ id: "attn-stock", dot: "bg-amber", title: "Supplies below minimum", desc: `${lowStock.map((s) => s.name).join(", ")} need restocking.`, tag: "Stock", href: "/housekeeping" });
    }

    return items
      .map((item) => ({ ...item, key: attentionKey(item.id, item.desc) }))
      .filter((item) => !dismissedKeys.has(item.key))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lateCleaningUnits, attentionFindings, overdueBillsForAttention, lowStock, bookingConflicts, pastDueBookings, unpaidAfterCheckout, failedSyncUnits, pendingExpenseRequests, quickCleans, pendingGuestRequests, reserveCodeStats, upcomingCheckinRiskUnits, batteryStats, lockedUnits, dismissedKeys]);

  // Monthly report figures — always the current calendar month, independent
  // of the Earnings card's Weekly/Monthly/Yearly filter, since "monthly
  // report" is a fixed snapshot (Excel/PDF export) rather than a filtered view.
  const [reportYear, reportMonthNum] = dayOf(new Date()).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(reportYear, reportMonthNum, 0)).getUTCDate();
  const reportMonthLabel = fmtDate(new Date(dayOf(new Date())), { month: "long", year: "numeric", timeZone: "Asia/Manila" });
  const monthlyOccupancyData = computeOccupancy({
    unitCount: units.length,
    periodStart: new Date(monthRangeStart),
    periodEnd: new Date(monthRangeEnd),
    bookings: bookingsMonth,
    maintenanceBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Maintenance"),
    cleaningBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Cleaning"),
  });
  const monthlyAvailableNights = monthlyOccupancyData.availableNights;
  const monthlyOccupancy = monthlyOccupancyData.occupancyPct;
  const monthlyRevpar = computeRevPAR(monthIncome * 100, monthlyAvailableNights);
  const monthlyAdr = computeADR(bookingsMonth, new Date(monthRangeStart), new Date(monthRangeEnd));

  const monthlyStayCounts = useMemo(() => {
    const c: Record<string, number> = { Daycation: 0, Night: 0, Full: 0 };
    bookingsMonth.forEach((b) => { if (c[b.stayType] !== undefined) c[b.stayType]++; });
    return c;
  }, [bookingsMonth]);
  const monthlyStayTotal = monthlyStayCounts.Daycation + monthlyStayCounts.Night + monthlyStayCounts.Full || 1;

  const monthlyPayroll = useMemo(() => {
    const map = new Map<string, number>();
    bookingsMonth.forEach((b) => {
      if (b.receivedById && b.paid && !b.refundedAt) map.set(b.receivedById, (map.get(b.receivedById) ?? 0) + (b.amount || 0));
      if (b.dpReceivedById && !b.refundedAt) map.set(b.dpReceivedById, (map.get(b.dpReceivedById) ?? 0) + (b.dpAmount || 0));
    });
    return employees
      .map((e) => ({ ...e, collected: map.get(e.id) ?? 0 }))
      .filter((e) => e.role === "BOOKER" || e.role === "HOUSEKEEPING" || e.collected > 0);
  }, [bookingsMonth, employees]);
  const monthlyPayrollTotal = monthlyPayroll.reduce((s, p) => s + p.collected, 0);

  const perUnitMonthlyEarned = useMemo(() => {
    const map = new Map<string, number>();
    bookingsMonth.forEach((b) => {
      map.set(b.unitId, (map.get(b.unitId) ?? 0) + collectedAmount(b));
    });
    return map;
  }, [bookingsMonth]);

  function buildMonthlyReport() {
    const p = (n: number) => "P" + Math.round(n || 0).toLocaleString("en-PH");
    const pc = (centavos: number) => "P" + (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      monthLabel: reportMonthLabel,
      summary: [
        ["Income (collected)", p(monthIncome)],
        ["Expected revenue (all bookings, full value)", p(expectedMonthIncome)],
        ["Paid expenses", pc(billsPaidMonthCentavos)],
        ["Pending expenses (not deducted)", pc(billsDueMonthCentavos)],
        ["Overdue expenses", pc(overdueCentavos)],
        ["Staff salaries (accrued to date)", p(accruedStaffSalary)],
        ["Staff salaries (upcoming this month)", p(upcomingStaffSalary)],
        ["Realized profit", p(netProfit)],
        ["Forecast profit", p(forecastProfit)],
        ["Profit margin", `${margin}%`],
        ["Cash flow", p(cashFlow)],
        ["Occupancy", `${monthlyOccupancy}%`],
        ["RevPAR", p(monthlyRevpar)],
        ["Nightly rate (ADR)", p(monthlyAdr)],
        ["Reservations", String(bookingsMonth.length)],
        ["Booked nights", String(bookingsMonth.length)],
        ["Payroll", p(monthlyPayrollTotal)],
      ],
      stayMix: (["Daycation", "Night", "Full"] as const)
        .map((k) => [STAY_TYPES[k].label, String(monthlyStayCounts[k]), `${Math.round((monthlyStayCounts[k] / monthlyStayTotal) * 100)}%`])
        .concat([["Total", String(monthlyStayCounts.Daycation + monthlyStayCounts.Night + monthlyStayCounts.Full), "100%"]]),
      listings: units.map((u) => [u.name, unitStatus(u).label, p(u.nightlyRate), p(perUnitMonthlyEarned.get(u.id) ?? 0)]),
      team: monthlyPayroll.map((emp) => [emp.name, emp.role.replace("_", " "), p(emp.collected)]),
      expenses: dueBills.map((b) => [billMeta(b).label, b.unit?.shortName ?? "Shared", pc(billCentavos(b))]),
      expensesTotal: pc(billsDueMonthCentavos),
    };
  }

  function csvCell(v: string) {
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function reportFileSlug(label: string) {
    return `evangelinas-staycation-monthly-${label.toLowerCase().replace(/\s+/g, "-")}`;
  }

  function exportExcel() {
    const r = buildMonthlyReport();
    const lines: string[] = [];
    lines.push("Evangelina's Staycation");
    lines.push(`Monthly report - ${r.monthLabel}`);
    lines.push("");
    lines.push("Summary");
    r.summary.forEach((row) => lines.push(row.map(csvCell).join(",")));
    lines.push("");
    lines.push(["Stay mix", "Bookings", "Share"].join(","));
    r.stayMix.forEach((row) => lines.push(row.map(csvCell).join(",")));
    lines.push("");
    lines.push(["Listing", "Status", "Rate/night", "Earned"].join(","));
    r.listings.forEach((row) => lines.push(row.map(csvCell).join(",")));
    lines.push("");
    lines.push(["Team member", "Role", "Collected"].join(","));
    r.team.forEach((row) => lines.push(row.map(csvCell).join(",")));
    lines.push("");
    lines.push(["Upcoming expense", "Unit", "Amount"].join(","));
    r.expenses.forEach((row) => lines.push(row.map(csvCell).join(",")));
    lines.push(["Total due this month", "", r.expensesTotal].map(csvCell).join(","));

    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `${reportFileSlug(r.monthLabel)}.csv`);
  }

  async function exportPDF() {
    // Loaded on demand, not at page load — jsPDF/autoTable are only ever
    // needed by this one click handler, and every Dashboard visit was
    // paying for them upfront otherwise (this app has hit real
    // over-fetching/over-bundling issues before; same fix here).
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const r = buildMonthlyReport();
    const doc = new jsPDF();
    const rausch = [255, 56, 92];
    const tableOpts: any = {
      theme: "plain",
      headStyles: { fillColor: rausch, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9.5, cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.1 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Evangelina's Staycation", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(110);
    doc.text(`Monthly report - ${r.monthLabel}`, 14, 25);
    doc.setTextColor(0);

    let y = 32;
    autoTable(doc, { ...tableOpts, startY: y, head: [["Summary", ""]], body: r.summary });
    y = (doc as any).lastAutoTable.finalY + 8;

    autoTable(doc, { ...tableOpts, startY: y, head: [["Stay mix", "Bookings", "Share"]], body: r.stayMix });
    y = (doc as any).lastAutoTable.finalY + 8;

    autoTable(doc, { ...tableOpts, startY: y, head: [["Listing", "Status", "Rate/night", "Earned"]], body: r.listings });
    y = (doc as any).lastAutoTable.finalY + 8;

    if (y > 250) { doc.addPage(); y = 20; }
    autoTable(doc, {
      ...tableOpts,
      startY: y,
      head: [["Team member", "Role", "Collected"]],
      body: r.team.length ? r.team : [["No staff activity recorded this month", "", "P0"]],
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    if (y > 250) { doc.addPage(); y = 20; }
    autoTable(doc, {
      ...tableOpts,
      startY: y,
      head: [["Upcoming expense", "Unit", "Amount"]],
      body: r.expenses.length ? [...r.expenses, ["Total due this month", "", r.expensesTotal]] : [["All bills paid this month", "", "P0"]],
    });

    doc.save(`${reportFileSlug(r.monthLabel)}.pdf`);
  }

  const filteredUnits = useMemo(
    () => (statusFilter === "all" ? units : units.filter((u) => statusCategory(u) === statusFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, statusFilter, bookingsWeek, hkStates]
  );

  const periodBookings = useMemo(() => {
    const unitIds = new Set(filteredUnits.map((u) => u.id));
    return earningsBookings.filter((b) => {
      if (!unitIds.has(b.unitId)) return false;
      const iso = dayOf(new Date(b.date));
      if (selectedDate && iso !== selectedDate) return false;
      const d = new Date(iso);
      return d >= periodRange.start && d < periodRange.end;
    });
  }, [earningsBookings, filteredUnits, selectedDate, periodRange]);

  const periodIncome = periodBookings.reduce((s, b) => s + collectedAmount(b), 0);

  // Occupancy/RevPAR/ADR for the Key metrics card — driven by the same
  // period+status filter as Earnings above (periodRange/filteredUnits),
  // instead of a permanently-fixed "this week, every unit" snapshot. Uses
  // periodBookings (already unit- and date-filtered) rather than
  // earningsBookings directly, so a Status filter like "Occupied only"
  // correctly narrows the unit count AND which bookings count toward it
  // together. Realized/Forecast profit, Margin, and Cash Flow deliberately
  // stay scoped to "this month" — they pull in bills/payroll/expense data
  // the server only ever fetches for the current month, not an arbitrary
  // selected period.
  const filteredOccupancyData = useMemo(
    () =>
      computeOccupancy({
        unitCount: filteredUnits.length,
        periodStart: periodRange.start,
        periodEnd: periodRange.end,
        bookings: periodBookings,
        maintenanceBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Maintenance"),
        cleaningBlocks: calendarBlocksOccupancy.filter((b) => b.type === "Cleaning"),
      }),
    [filteredUnits.length, periodRange, periodBookings, calendarBlocksOccupancy]
  );
  const filteredOccupancy = filteredOccupancyData.occupancyPct;
  const filteredRevpar = computeRevPAR(periodIncome * 100, filteredOccupancyData.availableNights);
  const filteredAdr = useMemo(
    () => computeADR(periodBookings, periodRange.start, periodRange.end),
    [periodBookings, periodRange]
  );

  // Previous period (same length, immediately prior) for the trend
  // indicator — reuses periodRangeFor for daily/weekly/monthly/yearly;
  // "custom" has no natural "previous" cadence, so it's approximated as the
  // same-length window immediately before the selected range.
  const previousPeriodRange = useMemo(() => {
    if (rangeType === "custom") {
      const lengthMs = periodRange.end.getTime() - periodRange.start.getTime();
      return { start: new Date(periodRange.start.getTime() - lengthMs), end: new Date(periodRange.start) };
    }
    return periodRangeFor(rangeType, periodOffset - 1, customRange);
  }, [rangeType, periodOffset, customRange, periodRange]);

  const previousPeriodIncome = useMemo(() => {
    const unitIds = new Set(filteredUnits.map((u) => u.id));
    return earningsBookings
      .filter((b) => {
        if (!unitIds.has(b.unitId)) return false;
        const d = new Date(dayOf(new Date(b.date)));
        return d >= previousPeriodRange.start && d < previousPeriodRange.end;
      })
      .reduce((s, b) => s + collectedAmount(b), 0);
  }, [earningsBookings, filteredUnits, previousPeriodRange]);

  const periodTrendPct =
    previousPeriodIncome > 0
      ? Math.round(((periodIncome - previousPeriodIncome) / previousPeriodIncome) * 100)
      : periodIncome > 0
      ? 100
      : 0;

  // Earnings-by-day buckets for the bar chart — bucketing by day past ~31
  // days would render an unreadable wall of slivers, so longer (yearly)
  // ranges collapse to one bar per month instead.
  const earningsBuckets = useMemo(() => {
    const byDay = periodDays <= 31;
    const buckets = new Map<string, { label: string; dateLabel: string; amount: number; count: number }>();
    const cursor = new Date(periodRange.start);
    while (cursor < periodRange.end) {
      const key = byDay ? dayOf(cursor) : `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = byDay
        ? new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(cursor)
        : new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(cursor);
      const dateLabel = byDay
        ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(cursor)
        : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(cursor);
      if (!buckets.has(key)) buckets.set(key, { label, dateLabel, amount: 0, count: 0 });
      if (byDay) cursor.setUTCDate(cursor.getUTCDate() + 1);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const b of periodBookings) {
      const d = new Date(dayOf(new Date(b.date)));
      const key = byDay ? dayOf(d) : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.amount += collectedAmount(b);
        bucket.count += 1;
      }
    }
    return [...buckets.values()];
  }, [periodRange, periodDays, periodBookings]);

  const avgStayNights = useMemo(() => {
    if (periodBookings.length === 0) return 0;
    const totalNights = periodBookings.reduce(
      (s, b) => s + nightsFor(b.stayType as any, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null),
      0
    );
    return totalNights / periodBookings.length;
  }, [periodBookings]);

  // Revenue by platform — same periodBookings/periodIncome the Earnings card
  // above uses, just split out per source, so the two always add up.
  // Walk-in and Direct are combined into one row (both are effectively the
  // same "no online platform" source from a revenue-mix standpoint) — every
  // other platform stays its own row.
  const platformBreakdown = useMemo(() => {
    const groups = [
      ...PLATFORMS.filter((p) => p !== "WalkIn" && p !== "Direct").map((p) => ({ key: p as string, label: PLATFORM_LABEL[p] ?? p, platforms: [p] as string[] })),
      { key: "WalkInDirect", label: "Walk-in/Direct", platforms: ["WalkIn", "Direct"] },
    ];
    const rows = groups.map((g) => {
      const pb = periodBookings.filter((b) => g.platforms.includes(b.platform));
      const revenue = pb.reduce((s, b) => s + collectedAmount(b), 0);
      const nights = pb.reduce((s, b) => s + nightsFor(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null), 0);
      return { platform: g.key, label: g.label, bookings: pb.length, nights, revenue };
    });
    return rows.filter((r) => r.bookings > 0);
  }, [periodBookings]);

  // Salary owed for this period — each active staff member's monthly salary
  // auto-scaled to the selected range (Today = prorated daily, This Week =
  // weekly rate, This Month = monthly rate, This Year = monthly × 12, Custom
  // = prorated by the number of days selected), using whatever rate was
  // historically effective at the start of the period so a later raise/cut
  // never rewrites an already-passed period's numbers. Distinct from
  // "Payroll" in Key metrics, which is money staff *collected* from guests,
  // not money paid *to* staff.
  const periodSalary = totalSalaryPayroll(employees, salaryHistory, rangeType, periodRange.start, periodDays);
  const periodTotalEarned = periodIncome - periodSalary;

  const periodStartIso = dayOf(periodRange.start);
  const periodEndIso = dayOf(new Date(periodRange.end.getTime() - 86400000));

  function resetFilters() {
    setRangeType("weekly");
    setPeriodOffset(0);
    setCustomRange({ start: "", end: "" });
    setSelectedDate(null);
    setStatusFilter("all");
  }

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

      <Accordion title="Earnings" sub={periodLabel}>
        {/* Collapsed by default — the accordion header above already shows
            periodLabel, so a big always-visible nav bar repeating it was
            pure redundancy that ate space on mobile. Icon-only (not
            repeating the label a second time here) — tap to reveal the
            period nav + Filters when you actually need them. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setPeriodNavOpen((v) => !v)}
            aria-label="Change period"
            aria-expanded={periodNavOpen}
            title="Change period"
            className={cn("btn-icon !h-8 !w-8", periodNavOpen && "border-[var(--ink)]")}
          >
            <FilterIcon className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportExcel} className="btn-icon !h-9 !w-9" aria-label="Excel report" title="Download this month's report as a spreadsheet">
              <FileSpreadsheetIcon className="h-4 w-4" />
            </button>
            <button onClick={exportPDF} className="btn-icon !h-9 !w-9" aria-label="PDF report" title="Download this month's report as a PDF">
              <FilePdfIcon className="h-4 w-4" />
            </button>
            <button onClick={() => setEarningsCollapsed((v) => !v)} className="btn-icon !h-9 !w-9" aria-label={earningsCollapsed ? "Expand" : "Collapse"} title={earningsCollapsed ? "Expand" : "Collapse"}>
              <ChevronDownIcon className={cn("h-4 w-4 transition-transform", earningsCollapsed && "-rotate-90")} />
            </button>
          </div>
        </div>

        {periodNavOpen && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {rangeType !== "custom" && (
              <button onClick={() => setPeriodOffset((o) => o - 1)} className="btn-icon !h-9 !w-9" aria-label="Previous period"><ArrowLeftIcon className="h-4 w-4" /></button>
            )}
            <span className="min-w-[150px] text-center text-[14.5px] font-extrabold">{periodLabel}</span>
            {rangeType !== "custom" && (
              <button onClick={() => setPeriodOffset((o) => o + 1)} className="btn-icon !h-9 !w-9" aria-label="Next period"><ArrowRightIcon className="h-4 w-4" /></button>
            )}
            <button onClick={() => setFiltersOpen((v) => !v)} className={cn("btn btn-sm", filtersOpen && "border-[var(--ink)]")}>
              <FilterIcon className="h-3.5 w-3.5" /> Filters
            </button>
          </div>
        )}

        {!earningsCollapsed && (
          <>
            {filtersOpen && (
              <div className="mb-4 rounded-2xl border border-[var(--line)] p-4">
                <div className="mb-3.5">
                  <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Time range</div>
                  <div className="inline-flex flex-wrap gap-1 rounded-full bg-[var(--bg-2)] p-1">
                    {(["daily", "weekly", "monthly", "yearly", "custom"] as const).map((rt) => (
                      <button
                        key={rt}
                        onClick={() => { setRangeType(rt); setPeriodOffset(0); setSelectedDate(null); }}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold capitalize transition", rangeType === rt ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
                      >
                        {rt === "daily" ? "Today" : rt}
                      </button>
                    ))}
                  </div>
                  {rangeType === "custom" && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={customRange.start}
                        max={customRange.end || undefined}
                        onChange={(e) => setCustomRange((c) => ({ ...c, start: e.target.value }))}
                        className="field-input w-auto"
                      />
                      <span className="text-[13px] text-[var(--gray)]">to</span>
                      <input
                        type="date"
                        value={customRange.end}
                        min={customRange.start || undefined}
                        onChange={(e) => setCustomRange((c) => ({ ...c, end: e.target.value }))}
                        className="field-input w-auto"
                      />
                    </div>
                  )}
                </div>

                <div className="mb-3.5">
                  <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Filter by date</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={selectedDate ?? ""}
                      min={periodStartIso}
                      max={periodEndIso}
                      onChange={(e) => setSelectedDate(e.target.value || null)}
                      className="field-input w-auto"
                    />
                    {selectedDate && (
                      <button onClick={() => setSelectedDate(null)} className="text-[13px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Clear</button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Status</div>
                  <div className="flex flex-wrap gap-2">
                    <Pill on={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</Pill>
                    <Pill on={statusFilter === "occupied"} onClick={() => setStatusFilter("occupied")}>Occupied</Pill>
                    <Pill on={statusFilter === "reserved"} onClick={() => setStatusFilter("reserved")}>Reserved</Pill>
                    <Pill on={statusFilter === "cleaning"} onClick={() => setStatusFilter("cleaning")}>Cleaning</Pill>
                    <Pill on={statusFilter === "available"} onClick={() => setStatusFilter("available")}>Available</Pill>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3.5">
                  <button onClick={resetFilters} className="text-[13px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Reset filters</button>
                  <button onClick={() => setFiltersOpen(false)} className="btn-primary btn-sm">Done</button>
                </div>
              </div>
            )}

            <p className="text-[13px] text-[var(--gray)]">
              You&rsquo;ve earned {rangeType === "daily" ? "today" : rangeType === "weekly" ? "this week" : rangeType === "monthly" ? "this month" : rangeType === "custom" ? "in this range" : "this year"}
            </p>
            <div className="mt-1 text-[38px] font-extrabold tracking-tight">{peso(periodIncome)}</div>
            {previousPeriodIncome > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[13px]">
                <span className={cn("inline-flex items-center gap-0.5 font-bold", periodTrendPct >= 0 ? "text-green" : "text-rausch")}>
                  {periodTrendPct >= 0 ? "▲" : "▼"} {Math.abs(periodTrendPct)}%
                </span>
                <span className="text-[var(--gray)]">vs previous {rangeType === "daily" ? "day" : rangeType === "weekly" ? "week" : rangeType === "monthly" ? "month" : rangeType === "custom" ? "period" : "year"}</span>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--gray)]">
              <span><b className="text-[var(--ink)]">{periodBookings.length}</b> booked nights</span>
              <span><b className="text-[var(--ink)]">{periodBookings.length}</b> reservations</span>
              {periodBookings.length > 0 && <span>Avg. stay <b className="text-[var(--ink)]">{avgStayNights.toFixed(1)} nights</b></span>}
              {(selectedDate || statusFilter !== "all") && (
                <span className="text-rausch">filtered{selectedDate ? ` · ${fmtDate(selectedDate, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}` : ""}{statusFilter !== "all" ? ` · ${statusFilter}` : ""}</span>
              )}
            </div>

            {earningsBuckets.length > 1 && (
              <div className="mt-4 flex h-[130px] items-end gap-2 sm:gap-3">
                {(() => {
                  const max = Math.max(1, ...earningsBuckets.map((b) => b.amount));
                  return earningsBuckets.map((b, i) => (
                    <div key={i} className="group relative flex flex-1 flex-col items-center gap-1.5">
                      <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1c1c1e] px-2.5 py-1.5 text-center opacity-0 shadow-card transition-opacity group-hover:opacity-100">
                        <div className="text-[11px] font-extrabold text-white">{peso(b.amount)}</div>
                        <div className="text-[10px] font-semibold text-white/70">{b.dateLabel} · {b.count} booking{b.count === 1 ? "" : "s"}</div>
                      </div>
                      <div
                        className={cn("w-full max-w-[36px] rounded-t-md transition-all group-hover:brightness-110", b.amount > 0 ? "bg-rausch" : "bg-[var(--bg-2)]")}
                        style={{ height: `${Math.max(4, Math.round((b.amount / max) * 80))}px` }}
                      />
                      <span className="text-[10.5px] font-semibold text-[var(--gray)]">{b.label}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-[var(--line)] p-4">
              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Computation</div>
              <div className="mt-2 space-y-1.5 text-[13.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--gray)]">Paid</span>
                  <span className="font-bold text-green">{peso(periodIncome)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--gray)]">Salary</span>
                  <span className="font-bold text-rausch">−{peso(periodSalary)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line)] pt-1.5 text-[14.5px]">
                  <span className="font-extrabold">Total earned</span>
                  <span className={cn("font-extrabold", periodTotalEarned < 0 && "text-amber")}>{peso(periodTotalEarned)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--line)] p-4">
              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Revenue by platform</div>
              {platformBreakdown.length === 0 ? (
                <p className="mt-2 text-[13px] text-[var(--gray)]">No bookings in this range.</p>
              ) : (
                <div className="mt-2.5 space-y-2">
                  {platformBreakdown.map((p) => {
                    const pct = periodIncome > 0 ? Math.round((p.revenue / periodIncome) * 100) : 0;
                    return (
                      <div key={p.platform} className="flex items-center gap-3 text-[13px]">
                        <span className="w-[100px] flex-none truncate font-bold" title={p.label}>{p.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
                          <div className="h-full rounded-full bg-rausch" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-[70px] flex-none text-right text-[11.5px] text-[var(--gray)]">{p.bookings} bkg · {p.nights}n</span>
                        <span className="w-[85px] flex-none text-right font-bold">{peso(p.revenue)}</span>
                        <span className="w-[38px] flex-none text-right text-[11.5px] text-[var(--gray)]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </Accordion>

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
          <StatCard label="Occupancy" value={`${filteredOccupancy}%`} sub={`across ${filteredUnits.length} unit${filteredUnits.length !== 1 ? "s" : ""}`} info={`Booked nights ${periodPhrase} ÷ total available nights.`} />
          <StatCard label="RevPAR" value={peso(filteredRevpar)} sub="revenue per available room" info={`${periodPhraseCap}'s income ÷ available room-nights.`} infoAlign="right" />
          <StatCard label="Nightly rate (ADR)" value={peso(filteredAdr)} sub="revenue ÷ occupied nights" info={`${periodPhraseCap}'s booked revenue ÷ actual nights stayed.`} infoAlign="right" />
        </div>
        {(aiInsight || keyMetricsInsights.length > 0) && (
          <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3.5">
            <p className="text-[12.5px] leading-relaxed text-[var(--gray)]">{aiInsight ?? keyMetricsInsights.join(" ")}</p>
          </div>
        )}
      </Accordion>

      <Accordion title="Stay mix" sub={`${stayTotal} bookings`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["Daycation", "Night", "Full"] as const).map((k) => {
            const pct = Math.round((stayCounts[k] / stayTotal) * 100);
            const meta = STAY_TYPES[k];
            return (
              <div key={k} className="stat-card">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold">{stayCounts[k]}</span>
                  <span className="text-sm font-bold" style={{ color: meta.color }}>{pct}%</span>
                </div>
                <div className="mt-1 text-sm font-bold">{meta.label} <span className="text-xs font-semibold text-[var(--gray)]">{meta.hrs}</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </Accordion>

      <Accordion title="Needs your attention" sub={`${attentionItems.length} to discuss`}>
        {attentionItems.length === 0 ? (
          <p className="text-sm text-[var(--gray)]">Nothing needs your attention right now. 🎉</p>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {attentionItems.map((item) => {
              const content = (
                <>
                  <span className={cn("mt-1.5 h-2.5 w-2.5 flex-none rounded-full", item.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold">{item.title}</div>
                    <div className="mt-0.5 text-[12px] text-[var(--gray)]">{item.desc}</div>
                  </div>
                  <span className="flex-none rounded-full border border-[var(--line)] px-3 py-1 text-[12px] font-bold text-[var(--gray)]">{item.tag}</span>
                  {item.href && <ArrowRightIcon className="h-3.5 w-3.5 flex-none text-[var(--gray)]" />}
                </>
              );
              return (
                <div key={item.id} className="flex items-start gap-2 py-3 first:pt-3 last:pb-3">
                  {item.href ? (
                    <Link href={item.href} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg -mx-2 px-2 py-1 transition hover:bg-[var(--bg-2)]">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-start gap-3">{content}</div>
                  )}
                  <button
                    onClick={() => dismissItem(item.key)}
                    aria-label="Mark as addressed"
                    title="Mark as addressed"
                    className="btn-icon !h-7 !w-7 flex-none"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Accordion>

      {lockedUnits.length > 0 && (
        <Accordion
          title="Battery health"
          sub={batteryStats.lastUpdated ? `Updated ${fmtDate(batteryStats.lastUpdated, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}` : "Not synced yet"}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Healthy" value={String(batteryStats.healthy)} sub={`above ${batteryLowThresholdPct}%`} />
            <StatCard label="Low" value={String(batteryStats.low)} sub={`${batteryCriticalThresholdPct + 1}–${batteryLowThresholdPct}%`} warn={batteryStats.low > 0} tone={batteryStats.low > 0 ? "caution" : undefined} />
            <StatCard label="Critical" value={String(batteryStats.critical)} sub={`${batteryCriticalThresholdPct}% or below`} warn={batteryStats.critical > 0} tone={batteryStats.critical > 0 ? "danger" : undefined} />
            <StatCard label="Offline" value={String(batteryStats.offline)} sub="not reporting" warn={batteryStats.offline > 0} tone={batteryStats.offline > 0 ? "caution" : undefined} />
            <StatCard label="Average battery" value={batteryStats.average !== null ? `${batteryStats.average}%` : "—"} sub={`${lockedUnits.length} lock${lockedUnits.length === 1 ? "" : "s"} linked`} />
          </div>
        </Accordion>
      )}

      {reserveCodeStats.total > 0 && (
        <Accordion
          title="Emergency access codes"
          sub={ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt)) ? "TTLock issue detected" : "TTLock connected"}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total reserve codes" value={String(reserveCodeStats.total)} sub="across all units" />
            <StatCard label="Available" value={String(reserveCodeStats.available)} sub="ready for the next outage" />
            <StatCard
              label="In use"
              value={String(reserveCodeStats.inUse)}
              sub="assigned to a booking"
              warn={reserveCodeStats.exhaustedUnits.length > 0}
              tone={reserveCodeStats.exhaustedUnits.length > 0 ? "danger" : undefined}
            />
            <StatCard
              label="TTLock connection"
              value={ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt)) ? "Failing" : "OK"}
              sub={ttlockStatus?.lastFailureAt ? `Last failure ${fmtDate(ttlockStatus.lastFailureAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}` : "No failures recorded"}
              warn={!!ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt))}
            />
          </div>
          {reserveCodeStats.exhaustedUnits.length > 0 && (
            <p className="mt-3 rounded-lg bg-rausch/10 px-3 py-2 text-[12.5px] font-semibold text-rausch">
              ⚠️ {reserveCodeStats.exhaustedUnits.map((u) => u.shortName).join(", ")} {reserveCodeStats.exhaustedUnits.length === 1 ? "has" : "have"} zero available emergency codes left.
            </p>
          )}
        </Accordion>
      )}

      <Accordion title="Your listings" sub={`${units.length} listings`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => {
            const st = unitStatus(u);
            const earn = bookingsWeek.filter((b) => b.unitId === u.id && !b.refundedAt).reduce((s, b) => s + b.amount + (b.dpAmount || 0), 0);
            return (
              <div key={u.id} className="card overflow-hidden">
                {u.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.photoUrl} alt={u.name} className="h-28 w-full object-cover" />
                ) : (
                  <div className="flex h-28 items-center justify-center bg-gradient-to-br from-rausch/15 to-violet/10 text-3xl">🏠</div>
                )}
                <div className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-bold">{u.name}</span>
                    <span className="text-[12px] font-bold text-amber">★ {u.rating.toFixed(1)}</span>
                  </div>
                  <div className="text-[11.5px] text-[var(--gray)]">{u.location}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold">
                    <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", st.dot)} /> {st.label}</span>
                    {u.ttlockLockId != null && (
                      <span className="flex items-center gap-1 text-[11px]">
                        🔋 {u.ttlockBatteryPct ?? "—"}%
                        {u.ttlockHasGateway === false && <span className="font-bold text-amber">· Offline</span>}
                        {batteryTier(u.ttlockBatteryPct) === "critical" && <span className="font-bold text-rausch">· Critical</span>}
                        {batteryTier(u.ttlockBatteryPct) === "low" && <span className="font-bold text-amber">· Low</span>}
                      </span>
                    )}
                  </div>
                  <div className="pt-1">
                    <div className="text-sm font-extrabold">{peso(u.nightlyRate)} <span className="text-xs font-semibold text-[var(--gray)]">night</span></div>
                    <div className="mt-0.5 text-sm font-extrabold text-green">{peso(earn)} <span className="text-[11px] font-semibold text-[var(--gray)]">wk</span></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Accordion>

      <Accordion title="Upcoming expenses" sub={expenseDateFilter ? `${fmtDate(expenseDateFilter, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} · tap to clear` : "tap a date to filter"}>
        {/* Paid vs Pending is the line that actually matters for the profit
            figures above — this app tracks a single paid/unpaid flag per
            bill (no separate Scheduled/Due/Overdue/Processing/Cancelled
            statuses), so "Pending" here covers all of those; "Overdue" is
            just the subset of Pending whose due date has already passed.
            Only "Paid this month" ever reaches Net Profit/Margin/Cash Flow. */}
        <div className="mb-3 grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-green/30 bg-green/5 p-3 text-center">
            <div className="text-lg font-extrabold text-green">{pesoCentavos(billsPaidMonthCentavos)}</div>
            <div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Paid this month</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3 text-center">
            <div className="text-lg font-extrabold">{pesoCentavos(billsDueMonthCentavos)}</div>
            <div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Pending (not yet deducted)</div>
          </div>
          <div className="rounded-xl border border-rausch/30 bg-rausch/5 p-3 text-center">
            <div className="text-lg font-extrabold text-rausch">{pesoCentavos(overdueCentavos)}</div>
            <div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Overdue</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          {visibleDueBills.length === 0 && (
            <p className="p-4 text-sm text-[var(--gray)]">{upcomingExpenseBills.length === 0 ? "Nothing overdue. 🎉" : "No expenses overdue on that date."}</p>
          )}
          {visibleDueBills.map((b) => {
            const meta = billMeta(b);
            const dueDate = dueDateFor(b);
            const dueIso = dueDate ? dayOf(dueDate) : null;
            const isActive = !!dueIso && expenseDateFilter === dueIso;
            return (
              <div key={b.id} className="flex items-center gap-3 border-t border-[var(--line)] p-4 first:border-0">
                {dueDate ? (
                  <button
                    onClick={() => setExpenseDateFilter((v) => (v === dueIso ? null : dueIso))}
                    className={cn("grid h-12 w-12 flex-none place-items-center rounded-xl transition", isActive ? "bg-rausch text-white" : "bg-[var(--bg-2)] hover:bg-[var(--line)]")}
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span className={cn("text-[9.5px] font-extrabold uppercase tracking-wide", isActive ? "text-white/80" : "text-rausch")}>
                        {fmtDate(dueDate, { month: "short", timeZone: "Asia/Manila" })}
                      </span>
                      <span className="text-[15px] font-extrabold">{fmtDate(dueDate, { day: "numeric", timeZone: "Asia/Manila" })}</span>
                    </span>
                  </button>
                ) : (
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[var(--bg-2)] text-lg">{meta.icon}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-bold">{meta.label}</span>
                    <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{b.unit?.shortName ?? "Shared"}</span>
                    <span className="rounded-full bg-rausch px-2 py-0.5 text-[10.5px] font-bold text-white">Overdue</span>
                  </div>
                  <div className="text-[11.5px] text-[var(--gray)]">{meta.sub}</div>
                </div>
                <div className="text-[14px] font-extrabold">{pesoCentavos(billCentavos(b))}</div>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--bg-2)] p-4 text-sm font-extrabold">
            <span>Total due this week</span>
            <span>{pesoCentavos(visibleDueBillsCentavos)}</span>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
