"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { Pill } from "@/components/ui/Pill";
import { peso, fmtDate, initials, pesoCentavos, billCentavos, billPaidCentavos } from "@/lib/format";
import { STAY_TYPES, BILL_TYPES, LOW_STOCK_THRESHOLD, ROLE_LABEL, PLATFORMS, PLATFORM_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, ArrowLeftIcon, FilterIcon, FileSpreadsheetIcon, FilePdfIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { nightsFor } from "@/lib/stayRange";
import {
  computeTeamBreakdown, isPayrollRole, totalSalaryPayroll,
  type PayrollRates, type DashboardPeriodType, type SalaryHistoryEntry,
} from "@/lib/payroll";
import { paidExpensesCentavos, pendingExpensesCentavos, netProfitCentavos as computeNetProfitCentavos, marginPct, cashFlowCentavos } from "@/lib/finance";

type Unit = { id: string; name: string; shortName: string; unitNumber: string; nightlyRate: number; rating: number; photoUrl: string | null; location: string; owners?: { user: { name: string } }[] };
type Booking = { id: string; unitId: string; unit?: Unit; date: string; checkOutDate: string | null; stayType: string; platform: string; amount: number; paid: boolean; dpAmount: number | null; guests: string[]; receivedById: string | null; dpReceivedById: string | null; cleanerId: string | null; bookerId: string | null };
type Employee = { id: string; name: string; role: string; monthlySalary: number; active?: boolean };
type Bill = { id: string; unitId: string | null; key: string; label: string | null; month: string; dueDay: number | null; amountDue: number; amountPaid: number | null; amountDueCentavos?: number | null; amountPaidCentavos?: number | null; paid: boolean; unit: Unit | null };
type HkState = { unitId: string; status: string; unit: Unit };
type WeeklyExpenseRow = { id: string; date: string; amount: number; note: string; targetEmployee: Employee | null };

// "Needs your attention" card — a lightweight cross-section of open Auditor
// findings, this week's due bills, and low stock. Not the full records (the
// Auditor page / Housekeeping page own those), just enough to flag them here.
type AttentionFinding = {
  id: string; title: string; notes: string | null; recommendedAction: string | null;
  category: string; severity: "Critical" | "Warning"; unit: { shortName: string } | null; employee: { name: string } | null;
};
type Stock = { id: string; unitId: string; name: string; count: number };
type CleaningLogRow = { id: string; employeeId: string | null; unitId: string; startedAt: string };

// Business runs in Manila (UTC+8) — always bucket "today"/period boundaries by
// the Manila calendar date, not the server or browser's own timezone.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

type RangeType = DashboardPeriodType;
type StatusFilter = "all" | "occupied" | "reserved" | "cleaning" | "available";

function periodRangeFor(rangeType: RangeType, offset: number, custom?: { start: string; end: string }) {
  const [y, m, d] = dayOf(new Date()).split("-").map(Number);
  if (rangeType === "daily") {
    const start = new Date(Date.UTC(y, m - 1, d));
    start.setUTCDate(start.getUTCDate() + offset);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  if (rangeType === "weekly") {
    const anchor = new Date(Date.UTC(y, m - 1, d));
    const start = new Date(anchor);
    start.setUTCDate(start.getUTCDate() - anchor.getUTCDay() + offset * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }
  if (rangeType === "monthly") {
    const start = new Date(Date.UTC(y, m - 1 + offset, 1));
    const end = new Date(Date.UTC(y, m + offset, 1));
    return { start, end };
  }
  if (rangeType === "custom") {
    const fallback = new Date(Date.UTC(y, m - 1, d));
    const fallbackEnd = new Date(fallback);
    fallbackEnd.setUTCDate(fallbackEnd.getUTCDate() + 1);
    if (!custom?.start || !custom?.end) return { start: fallback, end: fallbackEnd };
    const start = new Date(`${custom.start}T00:00:00Z`);
    const end = new Date(`${custom.end}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1); // inclusive of the selected end date
    return { start, end: end > start ? end : fallbackEnd };
  }
  const start = new Date(Date.UTC(y + offset, 0, 1));
  const end = new Date(Date.UTC(y + offset + 1, 0, 1));
  return { start, end };
}

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
  cleaningLogs,
  payrollRates,
  salaryHistory,
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
  cleaningLogs: CleaningLogRow[];
  payrollRates: PayrollRates;
}) {
  const { data: session } = useSession();
  const name = session?.user?.name?.split(" ")[0] ?? "there";

  // Only count the remaining-balance amount once it's actually paid — an
  // unpaid balance isn't collected revenue yet, same convention already
  // used by periodIncome/monthlyPayroll/perUnitMonthlyEarned below. The
  // downpayment is always counted since logging a DP receipt means it's
  // already in hand.
  const income = useMemo(
    () => bookingsWeek.reduce((sum, b) => sum + (b.paid ? b.amount : 0) + (b.dpAmount || 0), 0),
    [bookingsWeek]
  );
  const monthIncome = useMemo(
    () => bookingsMonth.reduce((sum, b) => sum + (b.paid ? b.amount : 0) + (b.dpAmount || 0), 0),
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

  // Cash-based accounting: only expenses actually marked Paid ever reduce
  // Net Profit, Margin, or Cash Flow — a bill that's merely Pending,
  // Scheduled, Due, or Overdue is excluded (billsDueMonthCentavos above is
  // never an input here). Staff salary has no separate "paid" flag in this
  // app, so it's always treated as an already-incurred cost, same as
  // before. All in centavos through the subtraction itself, so a recurring
  // expense's cents are actually reflected in the result — only the final
  // StatCard values below round to whole pesos.
  const netProfitCents = computeNetProfitCentavos({
    revenueCentavos: monthIncome * 100,
    paidExpensesCentavos: billsPaidMonthCentavos,
    otherPaidCostsCentavos: monthlyStaffSalary * 100,
  });
  const netProfit = Math.round(netProfitCents / 100);
  const margin = marginPct(netProfitCents, monthIncome * 100);
  const cashFlow = Math.round(
    cashFlowCentavos({ revenueCentavos: monthIncome * 100, paidExpensesCentavos: billsPaidMonthCentavos, otherPaidCostsCentavos: monthlyStaffSalary * 100 }) / 100
  );

  const occupiedNights = bookingsWeek.length;
  const availableNights = units.length * 7;
  const occupancy = availableNights > 0 ? Math.round((occupiedNights / availableNights) * 100) : 0;
  const revpar = units.length > 0 ? Math.round(income / units.length / 7) : 0;

  const stayCounts = useMemo(() => {
    const c: Record<string, number> = { Daycation: 0, Night: 0, Full: 0 };
    bookingsWeek.forEach((b) => { if (c[b.stayType] !== undefined) c[b.stayType]++; });
    return c;
  }, [bookingsWeek]);
  const stayTotal = stayCounts.Daycation + stayCounts.Night + stayCounts.Full || 1;

  const payroll = useMemo(() => {
    const map = new Map<string, number>();
    bookingsWeek.forEach((b) => {
      if (b.receivedById && b.paid) map.set(b.receivedById, (map.get(b.receivedById) ?? 0) + (b.amount || 0));
      if (b.dpReceivedById) map.set(b.dpReceivedById, (map.get(b.dpReceivedById) ?? 0) + (b.dpAmount || 0));
    });
    return employees
      .map((e) => ({ ...e, collected: map.get(e.id) ?? 0 }))
      .filter((e) => e.role === "BOOKER" || e.role === "HOUSEKEEPING" || e.collected > 0);
  }, [bookingsWeek, employees]);
  const payrollTotal = payroll.reduce((s, p) => s + p.collected, 0);

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
  const periodLabelShort = rangeType === "daily" ? "today" : rangeType === "weekly" ? "this week" : rangeType === "monthly" ? "this month" : rangeType === "custom" ? "in this range" : "this year";

  // "Your team" — real wages owed for the SAME period selected on the
  // Earnings card above (Today/This week/This month/This year/Custom), by
  // role-specific formula:
  //  · Housekeeping: ₱700 per distinct day with a logged cleaning session,
  //    plus a ₱300 bonus per Night-stay booking they cleaned.
  //  · Booker: ₱100 per booking they logged, plus any "Salary" (WeeklyExpense)
  //    entries logged in the period. Any other manual expense charged to
  //    them (ad boosts, etc.) is deducted, not added.
  //  · Auditor: a flat weekly rate, scaled by how many weeks the selected
  //    period spans (periodWeeks below) — the only line here that isn't
  //    naturally period-scaled just by filtering to a wider date range.
  // Uses earningsBookings (the broad, unwindowed set), not bookingsWeek,
  // since bookingsWeek is hard-capped server-side to the last 7 days and
  // can't answer "this month"/"this year". Read-only summary — the full
  // editor for manual weekly expenses lives on the Admin page's Weekly
  // report tab.
  const teamBookingsThisPeriod = earningsBookings.filter((b) => {
    const d = new Date(dayOf(new Date(b.date)));
    return d >= periodRange.start && d < periodRange.end;
  });
  const teamExpensesThisPeriod = weeklyExpenses.filter((e) => {
    const d = new Date(dayOf(new Date(e.date)));
    return d >= periodRange.start && d < periodRange.end;
  });
  const cleaningDaysByEmployee = new Map<string, Set<string>>();
  cleaningLogs.forEach((c) => {
    if (!c.employeeId) return;
    const d = dayOf(new Date(c.startedAt));
    if (new Date(d) < periodRange.start || new Date(d) >= periodRange.end) return;
    if (!cleaningDaysByEmployee.has(c.employeeId)) cleaningDaysByEmployee.set(c.employeeId, new Set());
    cleaningDaysByEmployee.get(c.employeeId)!.add(d);
  });

  const normalizedTeamExpensesThisPeriod = teamExpensesThisPeriod.map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: e.targetEmployee?.id ?? null }));
  const periodWeeks = Math.max(periodDays / 7, 1 / 7);

  const teamCalcs = employees
    .filter((e) => isPayrollRole(e.role))
    .map((e) => ({
      employee: e,
      ...computeTeamBreakdown(e, {
        cleaningDays: cleaningDaysByEmployee.get(e.id)?.size ?? 0,
        weekBookings: teamBookingsThisPeriod,
        weekExpenses: normalizedTeamExpensesThisPeriod,
        rates: payrollRates,
        periodWeeks,
      }),
    }));
  const teamPayrollTotal = teamCalcs.reduce((s, t) => s + t.total, 0);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const AVATAR_COLORS = ["bg-rausch", "bg-teal", "bg-violet", "bg-amber", "bg-blue", "bg-green"];

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

  // "Needs your attention" — cross-section of open Auditor findings,
  // overdue bills, and low stock. Purely a summary; each source's own page
  // (Auditor / Housekeeping) still owns the full record. Only genuinely
  // overdue bills are flagged here — "due soon" bills aren't surfaced.
  const overdueBillsForAttention = dueBills.filter((b) => {
    const d = dueDateFor(b);
    return d && d < new Date(`${dayOf(new Date())}T00:00:00Z`);
  });
  const lowStock = stocks.filter((s) => s.count <= LOW_STOCK_THRESHOLD);

  const attentionItems = useMemo(() => {
    const items: { id: string; dot: string; title: string; desc: string; tag: string }[] = [];

    attentionFindings.forEach((f) => {
      items.push({
        id: f.id,
        dot: f.severity === "Critical" ? "bg-rausch" : "bg-amber",
        title: f.title,
        desc: f.notes || f.recommendedAction || `${f.unit?.shortName ?? "All units"}${f.employee ? ` · ${f.employee.name}` : ""}`,
        tag: "Auditor",
      });
    });

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
      items.push({ id: "attn-stock", dot: "bg-amber", title: "Supplies below minimum", desc: `${lowStock.map((s) => s.name).join(", ")} need restocking.`, tag: "Stock" });
    }

    return items.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attentionFindings, overdueBillsForAttention, lowStock]);

  // Monthly report figures — always the current calendar month, independent
  // of the Earnings card's Weekly/Monthly/Yearly filter, since "monthly
  // report" is a fixed snapshot (Excel/PDF export) rather than a filtered view.
  const [reportYear, reportMonthNum] = dayOf(new Date()).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(reportYear, reportMonthNum, 0)).getUTCDate();
  const reportMonthLabel = fmtDate(new Date(dayOf(new Date())), { month: "long", year: "numeric", timeZone: "Asia/Manila" });
  const monthlyAvailableNights = units.length * daysInMonth;
  const monthlyOccupancy = monthlyAvailableNights > 0 ? Math.round((bookingsMonth.length / monthlyAvailableNights) * 100) : 0;
  const monthlyRevpar = units.length > 0 ? Math.round(monthIncome / units.length / daysInMonth) : 0;

  const monthlyStayCounts = useMemo(() => {
    const c: Record<string, number> = { Daycation: 0, Night: 0, Full: 0 };
    bookingsMonth.forEach((b) => { if (c[b.stayType] !== undefined) c[b.stayType]++; });
    return c;
  }, [bookingsMonth]);
  const monthlyStayTotal = monthlyStayCounts.Daycation + monthlyStayCounts.Night + monthlyStayCounts.Full || 1;

  const monthlyPayroll = useMemo(() => {
    const map = new Map<string, number>();
    bookingsMonth.forEach((b) => {
      if (b.receivedById && b.paid) map.set(b.receivedById, (map.get(b.receivedById) ?? 0) + (b.amount || 0));
      if (b.dpReceivedById) map.set(b.dpReceivedById, (map.get(b.dpReceivedById) ?? 0) + (b.dpAmount || 0));
    });
    return employees
      .map((e) => ({ ...e, collected: map.get(e.id) ?? 0 }))
      .filter((e) => e.role === "BOOKER" || e.role === "HOUSEKEEPING" || e.collected > 0);
  }, [bookingsMonth, employees]);
  const monthlyPayrollTotal = monthlyPayroll.reduce((s, p) => s + p.collected, 0);

  const perUnitMonthlyEarned = useMemo(() => {
    const map = new Map<string, number>();
    bookingsMonth.forEach((b) => {
      map.set(b.unitId, (map.get(b.unitId) ?? 0) + (b.paid ? b.amount : 0) + (b.dpAmount || 0));
    });
    return map;
  }, [bookingsMonth]);

  function buildMonthlyReport() {
    const p = (n: number) => "P" + Math.round(n || 0).toLocaleString("en-PH");
    const pc = (centavos: number) => "P" + (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      monthLabel: reportMonthLabel,
      summary: [
        ["Income", p(monthIncome)],
        ["Paid expenses", pc(billsPaidMonthCentavos)],
        ["Pending expenses (not deducted)", pc(billsDueMonthCentavos)],
        ["Overdue expenses", pc(overdueCentavos)],
        ["Staff salaries", p(monthlyStaffSalary)],
        ["Net profit", p(netProfit)],
        ["Profit margin", `${margin}%`],
        ["Cash flow", p(cashFlow)],
        ["Occupancy", `${monthlyOccupancy}%`],
        ["RevPAR", p(monthlyRevpar)],
        ["Nightly rate (ADR)", p(units[0]?.nightlyRate ?? 1799)],
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

  function exportPDF() {
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

  const periodIncome = periodBookings.reduce((s, b) => s + (b.paid ? b.amount : 0) + (b.dpAmount || 0), 0);

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
      const revenue = pb.reduce((s, b) => s + (b.paid ? b.amount : 0) + (b.dpAmount || 0), 0);
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {rangeType !== "custom" && (
              <button onClick={() => setPeriodOffset((o) => o - 1)} className="btn-icon !h-9 !w-9" aria-label="Previous period"><ArrowLeftIcon className="h-4 w-4" /></button>
            )}
            <span className="min-w-[170px] text-center text-[14.5px] font-extrabold">{periodLabel}</span>
            {rangeType !== "custom" && (
              <button onClick={() => setPeriodOffset((o) => o + 1)} className="btn-icon !h-9 !w-9" aria-label="Next period"><ArrowRightIcon className="h-4 w-4" /></button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setFiltersOpen((v) => !v)} className={cn("btn btn-sm", filtersOpen && "border-[var(--ink)]")}>
              <FilterIcon className="h-3.5 w-3.5" /> Filters
            </button>
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
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--gray)]">
              <span><b className="text-[var(--ink)]">{periodBookings.length}</b> booked nights</span>
              <span><b className="text-[var(--ink)]">{periodBookings.length}</b> reservations</span>
              {(selectedDate || statusFilter !== "all") && (
                <span className="text-rausch">filtered{selectedDate ? ` · ${fmtDate(selectedDate, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}` : ""}{statusFilter !== "all" ? ` · ${statusFilter}` : ""}</span>
              )}
            </div>

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
              softer "worth a look," not an alarm. Occupancy/RevPAR/ADR/Payroll
              can't mathematically go negative, so they never get either. */}
          <StatCard label="Net profit" value={peso(netProfit)} sub="after all costs" warn={netProfit < 0} tone="caution" />
          <StatCard label="Profit margin" value={`${margin}%`} sub="income kept as profit" warn={margin < 0} tone="caution" />
          <StatCard label="Cash flow" value={peso(cashFlow)} sub="paid − bills paid − salaries" warn={cashFlow < 0} tone="caution" />
          <StatCard label="Occupancy" value={`${occupancy}%`} sub={`across ${units.length} units`} />
          <StatCard label="RevPAR" value={peso(revpar)} sub="revenue per available room" />
          <StatCard label="Nightly rate (ADR)" value={peso(units[0]?.nightlyRate ?? 1799)} sub="base rate" />
          <StatCard label="Payroll" value={peso(payrollTotal)} sub={`${payroll.length} people`} />
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--gray)]">Net profit and Cash flow deduct only <b>paid</b> expenses ({pesoCentavos(billsPaidMonthCentavos)}) plus this month&rsquo;s staff salaries ({peso(monthlyStaffSalary)}) — pending, due, and overdue bills ({pesoCentavos(billsDueMonthCentavos)}) aren&rsquo;t deducted until marked paid.</p>
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
            {attentionItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className={cn("mt-1.5 h-2.5 w-2.5 flex-none rounded-full", item.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold">{item.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--gray)]">{item.desc}</div>
                </div>
                <span className="flex-none rounded-full border border-[var(--line)] px-3 py-1 text-[12px] font-bold text-[var(--gray)]">{item.tag}</span>
              </div>
            ))}
          </div>
        )}
      </Accordion>

      <Accordion title="Your listings" sub={`${units.length} listings`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => {
            const st = unitStatus(u);
            const earn = bookingsWeek.filter((b) => b.unitId === u.id).reduce((s, b) => s + b.amount + (b.dpAmount || 0), 0);
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
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <span className={cn("h-2 w-2 rounded-full", st.dot)} /> {st.label}
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
            <span>Total due this month</span>
            <span>{pesoCentavos(billsDueMonthCentavos)}</span>
          </div>
        </div>
      </Accordion>

      <Accordion title="Your team" sub={periodLabelShort}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-[var(--gray)]">Commission-based earnings collected {periodLabelShort}, by role — follows the same period filter as Earnings above.</p>
          {role === "OWNER_ADMIN" && (
            <Link href="/admin?tab=staff" className="flex-none text-[12.5px] font-bold text-rausch hover:underline">
              Manage staff →
            </Link>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          {teamCalcs.length === 0 && <p className="p-4 text-sm text-[var(--gray)]">No staff activity recorded yet.</p>}
          {teamCalcs.map(({ employee: emp, total, items, subtitle }, i) => {
            const isOpen = expandedTeamId === emp.id;
            return (
              <div key={emp.id} className="border-t border-[var(--line)] first:border-0">
                <button onClick={() => setExpandedTeamId(isOpen ? null : emp.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-full text-[13px] font-bold text-white", AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                    {initials(emp.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold">{emp.name}</div>
                    <div className="text-[12px] text-[var(--gray)]">{ROLE_LABEL[emp.role] ?? emp.role}</div>
                    {subtitle && <div className="mt-0.5 text-[11.5px] text-[var(--gray)]">{subtitle}</div>}
                  </div>
                  <div className="flex-none text-right">
                    <div className={cn("text-[16px] font-extrabold", total < 0 && "text-amber")}>{peso(total)}</div>
                    <div className="text-[11px] text-[var(--gray)]">{periodLabelShort}</div>
                  </div>
                  <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
                    {items.length === 0 && <p className="text-[12.5px] text-[var(--gray)]">No activity this week.</p>}
                    {items.map((item, j) => (
                      <div key={j} className="flex items-center justify-between text-[13px]">
                        <div>
                          <div className="font-bold">{item.label}</div>
                          <div className="text-[11.5px] text-[var(--gray)]">{item.detail}</div>
                        </div>
                        <div className={cn("font-bold", item.deduction && "text-rausch")}>{item.deduction ? "−" : ""}{peso(item.amount)}</div>
                      </div>
                    ))}
                    {items.length > 0 && (
                      <div className="flex items-center justify-between border-t border-dashed border-[var(--line-2)] pt-2 text-[13px] font-extrabold">
                        <span>Subtotal</span>
                        <span className={cn(total < 0 && "text-amber")}>{peso(total)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-between bg-[var(--bg-2)] p-4 text-sm font-extrabold">
            <span>Total payroll</span>
            <span className="text-rausch">{peso(teamPayrollTotal)}</span>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
