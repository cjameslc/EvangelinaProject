"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { Pill } from "@/components/ui/Pill";
import { peso, fmtDate } from "@/lib/format";
import { STAY_TYPES, BILL_TYPES, LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, ArrowLeftIcon, FilterIcon, FileSpreadsheetIcon, FilePdfIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { WeeklyReport } from "./WeeklyReport";

type Unit = { id: string; name: string; shortName: string; unitNumber: string; nightlyRate: number; rating: number; location: string; owners?: { user: { name: string } }[] };
type Booking = { id: string; unitId: string; unit?: Unit; date: string; stayType: string; amount: number; paid: boolean; dpAmount: number | null; guests: string[]; receivedById: string | null; dpReceivedById: string | null };
type Employee = { id: string; name: string; role: string };
type Bill = { id: string; unitId: string; key: string; label: string | null; month: string; dueDay: number | null; amountDue: number; amountPaid: number | null; paid: boolean; unit: Unit };
type HkState = { unitId: string; status: string; unit: Unit };

// Shapes for the Weekly report card — richer than the plain Booking/Unit
// types above since WeeklyReport needs booker/platform/payment-method detail.
type WeeklyPerson = { name: string; role: string };
type WeeklyUnit = { id: string; name: string; shortName: string; unitNumber: string; owners?: { user: { name: string } }[] };
type WeeklyBooking = {
  id: string; date: string; unit: WeeklyUnit; guests: string[]; pax: number | null; platform: string;
  amount: number; paid: boolean; method: string | null;
  dpAmount: number | null; dpMethod: string | null;
  booker: WeeklyPerson | null; receivedBy: WeeklyPerson | null; dpReceivedBy: WeeklyPerson | null;
};
type WeeklyExpenseRow = { id: string; date: string; amount: number; note: string; targetEmployee: Employee | null };

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

type RangeType = "weekly" | "monthly" | "yearly";
type StatusFilter = "all" | "occupied" | "reserved" | "cleaning" | "available";

function periodRangeFor(rangeType: RangeType, offset: number) {
  const [y, m, d] = dayOf(new Date()).split("-").map(Number);
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
  weeklyReportBookings,
  weeklyExpenses,
  canEditExpenses,
  attentionFindings,
  stocks,
}: {
  role: string;
  units: Unit[];
  bookingsWeek: Booking[];
  bookingsMonth: Booking[];
  employees: Employee[];
  bills: Bill[];
  hkStates: HkState[];
  earningsBookings: Booking[];
  weeklyReportBookings: WeeklyBooking[];
  weeklyExpenses: WeeklyExpenseRow[];
  canEditExpenses: boolean;
  attentionFindings: AttentionFinding[];
  stocks: Stock[];
}) {
  const { data: session } = useSession();
  const name = session?.user?.name?.split(" ")[0] ?? "there";

  const income = useMemo(
    () => bookingsWeek.reduce((sum, b) => sum + (b.amount || 0) + (b.dpAmount || 0), 0),
    [bookingsWeek]
  );
  const monthIncome = useMemo(
    () => bookingsMonth.reduce((sum, b) => sum + (b.amount || 0) + (b.dpAmount || 0), 0),
    [bookingsMonth]
  );
  const billsDueMonth = useMemo(() => bills.reduce((s, b) => s + (b.paid ? 0 : b.amountDue), 0), [bills]);
  const billsPaidMonth = useMemo(() => bills.reduce((s, b) => s + (b.paid ? (b.amountPaid ?? b.amountDue) : 0), 0), [bills]);
  const netProfit = monthIncome - billsPaidMonth - billsDueMonth;
  const margin = monthIncome > 0 ? Math.round((netProfit / monthIncome) * 100) : 0;

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
      if (b.receivedById) map.set(b.receivedById, (map.get(b.receivedById) ?? 0) + (b.amount || 0));
      if (b.dpReceivedById) map.set(b.dpReceivedById, (map.get(b.dpReceivedById) ?? 0) + (b.dpAmount || 0));
    });
    return employees
      .map((e) => ({ ...e, collected: map.get(e.id) ?? 0 }))
      .filter((e) => e.role === "BOOKER" || e.role === "HOUSEKEEPING" || e.collected > 0);
  }, [bookingsWeek, employees]);
  const payrollTotal = payroll.reduce((s, p) => s + p.collected, 0);

  const today = new Date().toDateString();
  function unitStatus(unit: Unit) {
    const hk = hkStates.find((h) => h.unitId === unit.id);
    if (hk?.status === "cleaning") return { label: "Cleaning", dot: "bg-teal" };
    const todays = bookingsWeek.find((b) => b.unitId === unit.id && new Date(b.date).toDateString() === today);
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
  const dueBills = [...bills.filter((b) => !b.paid)].sort((a, b) => {
    const da = dueDateFor(a);
    const db = dueDateFor(b);
    if (da && db) return da.getTime() - db.getTime();
    if (da) return -1;
    if (db) return 1;
    return 0;
  });

  const [expenseDateFilter, setExpenseDateFilter] = useState<string | null>(null);
  const thisWeekRange = periodRangeFor("weekly", 0);
  const visibleDueBills = useMemo(() => {
    if (!expenseDateFilter) return dueBills;
    return dueBills.filter((b) => {
      const d = dueDateFor(b);
      return d && dayOf(d) === expenseDateFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueBills, expenseDateFilter]);

  // "Needs your attention" — cross-section of open Auditor findings, bills
  // due this week, and low stock. Purely a summary; each source's own page
  // (Auditor / Housekeeping) still owns the full record.
  const billsDueThisWeek = dueBills.filter((b) => {
    const d = dueDateFor(b);
    return d && d >= thisWeekRange.start && d < thisWeekRange.end;
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

    if (billsDueThisWeek.length > 0) {
      const total = billsDueThisWeek.reduce((s, b) => s + b.amountDue, 0);
      const desc = billsDueThisWeek
        .map((b) => {
          const d = dueDateFor(b);
          return `${billMeta(b).label}${d ? ` (${fmtDate(d, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})` : ""}`;
        })
        .join(", ");
      items.push({ id: "attn-bills", dot: "bg-amber", title: `${peso(total)} in bills due this week`, desc: `${desc}. See Upcoming expenses below.`, tag: "Expenses" });
    }

    if (lowStock.length > 0) {
      items.push({ id: "attn-stock", dot: "bg-amber", title: "Supplies below minimum", desc: `${lowStock.map((s) => s.name).join(", ")} need restocking.`, tag: "Stock" });
    }

    return items.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attentionFindings, billsDueThisWeek, lowStock]);

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
    return {
      monthLabel: reportMonthLabel,
      summary: [
        ["Income", p(monthIncome)],
        ["Net profit", p(netProfit)],
        ["Profit margin", `${margin}%`],
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
      expenses: dueBills.map((b) => [billMeta(b).label, b.unit.shortName, p(b.amountDue)]),
      expensesTotal: p(billsDueMonth),
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

  // Earnings period filter — Weekly/Monthly/Yearly, an optional single day,
  // and unit status. Scoped only to the Earnings card; every other section
  // keeps using the fixed last-7-days / month-to-date figures above.
  const [rangeType, setRangeType] = useState<RangeType>("weekly");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [earningsCollapsed, setEarningsCollapsed] = useState(false);

  const periodRange = useMemo(() => periodRangeFor(rangeType, periodOffset), [rangeType, periodOffset]);
  const periodLabel = useMemo(() => {
    if (rangeType === "weekly") {
      const lastDay = new Date(periodRange.end.getTime() - 86400000);
      return `${fmtDate(periodRange.start, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} – ${fmtDate(lastDay, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`;
    }
    if (rangeType === "monthly") return fmtDate(periodRange.start, { month: "long", year: "numeric", timeZone: "Asia/Manila" });
    return fmtDate(periodRange.start, { year: "numeric", timeZone: "Asia/Manila" });
  }, [rangeType, periodRange]);

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

  // Salary paid out this period — the recurring/manual "Salary" weekly
  // expenses (Riemar, Jayjay, etc.), same period the Earnings figure above
  // uses. Distinct from "Payroll" in Key metrics, which is money staff
  // *collected* from guests, not money paid *to* staff.
  const periodSalary = weeklyExpenses
    .filter((e) => e.note === "Salary" && new Date(dayOf(new Date(e.date))) >= periodRange.start && new Date(dayOf(new Date(e.date))) < periodRange.end)
    .reduce((s, e) => s + e.amount, 0);
  const periodTotalEarned = periodIncome - periodSalary;

  const periodStartIso = dayOf(periodRange.start);
  const periodEndIso = dayOf(new Date(periodRange.end.getTime() - 86400000));

  function resetFilters() {
    setRangeType("weekly");
    setPeriodOffset(0);
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

      <Accordion title="Earnings" sub={periodLabel}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPeriodOffset((o) => o - 1)} className="btn-icon !h-9 !w-9" aria-label="Previous period"><ArrowLeftIcon className="h-4 w-4" /></button>
            <span className="min-w-[170px] text-center text-[14.5px] font-extrabold">{periodLabel}</span>
            <button onClick={() => setPeriodOffset((o) => o + 1)} className="btn-icon !h-9 !w-9" aria-label="Next period"><ArrowRightIcon className="h-4 w-4" /></button>
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
                  <div className="inline-flex gap-1 rounded-full bg-[var(--bg-2)] p-1">
                    {(["weekly", "monthly", "yearly"] as const).map((rt) => (
                      <button
                        key={rt}
                        onClick={() => { setRangeType(rt); setPeriodOffset(0); setSelectedDate(null); }}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold capitalize transition", rangeType === rt ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
                      >
                        {rt}
                      </button>
                    ))}
                  </div>
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

            <p className="text-[13px] text-[var(--gray)]">You&rsquo;ve earned {rangeType === "weekly" ? "this week" : rangeType === "monthly" ? "this month" : "this year"}</p>
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
                  <span className={cn("font-extrabold", periodTotalEarned < 0 && "text-rausch")}>{peso(periodTotalEarned)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </Accordion>

      <Accordion title="Key metrics">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Net profit" value={peso(netProfit)} sub="after all costs" warn={netProfit < 0} />
          <StatCard label="Profit margin" value={`${margin}%`} sub="income kept as profit" warn={margin < 0} />
          <StatCard label="Occupancy" value={`${occupancy}%`} sub={`across ${units.length} units`} warn={occupancy < 0} />
          <StatCard label="RevPAR" value={peso(revpar)} sub="revenue per available room" warn={revpar < 0} />
          <StatCard label="Nightly rate (ADR)" value={peso(units[0]?.nightlyRate ?? 1799)} sub="base rate" warn={(units[0]?.nightlyRate ?? 1799) < 0} />
          <StatCard label="Payroll" value={peso(payrollTotal)} sub={`${payroll.length} people`} warn={payrollTotal < 0} />
        </div>
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

      <Accordion title="Your listings" sub={`${units.length} listings`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => {
            const st = unitStatus(u);
            const earn = bookingsWeek.filter((b) => b.unitId === u.id).reduce((s, b) => s + b.amount + (b.dpAmount || 0), 0);
            return (
              <div key={u.id} className="card overflow-hidden">
                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-rausch/15 to-violet/10 text-3xl">🏠</div>
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
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          {visibleDueBills.length === 0 && (
            <p className="p-4 text-sm text-[var(--gray)]">{dueBills.length === 0 ? "All bills for this month are paid. 🎉" : "No expenses due on that date."}</p>
          )}
          {visibleDueBills.map((b) => {
            const meta = billMeta(b);
            const dueDate = dueDateFor(b);
            const dueIso = dueDate ? dayOf(dueDate) : null;
            const isDueThisWeek = !!dueDate && dueDate >= thisWeekRange.start && dueDate < thisWeekRange.end;
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
                    <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{b.unit.shortName}</span>
                    {isDueThisWeek && <span className="rounded-full bg-rausch/10 px-2 py-0.5 text-[10.5px] font-bold text-rausch">Due this week</span>}
                  </div>
                  <div className="text-[11.5px] text-[var(--gray)]">{meta.sub}</div>
                </div>
                <div className="text-[14px] font-extrabold">{peso(b.amountDue)}</div>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--bg-2)] p-4 text-sm font-extrabold">
            <span>Total due this month</span>
            <span>{peso(billsDueMonth)}</span>
          </div>
        </div>
      </Accordion>

      <Accordion title="Your team" sub="collected this week">
        <div className="space-y-0">
          {payroll.length === 0 && <p className="text-sm text-[var(--gray)]">No staff activity recorded yet.</p>}
          {payroll.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-t border-[var(--line)] py-3 first:border-0">
              <div>
                <div className="text-[13.5px] font-bold">{p.name}</div>
                <div className="text-[12px] text-[var(--gray)]">{p.role.replace("_", " ")}</div>
              </div>
              <div className="text-[14px] font-extrabold">{peso(p.collected)}</div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-[var(--line)] pt-3 text-sm font-extrabold">
            <span>Total</span>
            <span>{peso(payrollTotal)}</span>
          </div>
        </div>
      </Accordion>

      <Accordion title="Weekly report" sub="Sun–Sat breakdown">
        <WeeklyReport
          bookings={weeklyReportBookings}
          units={units}
          employees={employees}
          initialExpenses={weeklyExpenses}
          canEditExpenses={canEditExpenses}
        />
      </Accordion>
    </div>
  );
}
