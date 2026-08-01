import { useMemo } from "react";
import { peso, fmtDate, billCentavos, formatUnitDisplay } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { computeOccupancy, computeADR, computeRevPAR, type OccupancyBlock } from "@/lib/analytics/occupancy";
import { collectedAmountPesos } from "@/lib/finance";
import { manilaDayKey as dayOf } from "@/lib/analytics/period";
import type { Unit, Booking, Employee, Bill } from "../types";

const collectedAmount = (b: Booking): number => collectedAmountPesos(b);

/**
 * Monthly report figures — always the current calendar month, independent
 * of the Earnings card's Weekly/Monthly/Yearly filter, since "monthly
 * report" is a fixed snapshot (Excel/PDF export) rather than a filtered
 * view.
 */
export function useMonthlyReportExport({
  units,
  bookingsMonth,
  employees,
  monthRangeStart,
  monthRangeEnd,
  calendarBlocksOccupancy,
  unitStatus,
  todayIso,
  monthIncome,
  expectedMonthIncome,
  billsPaidMonthCentavos,
  billsDueMonthCentavos,
  overdueCentavos,
  accruedStaffSalary,
  upcomingStaffSalary,
  netProfit,
  forecastProfit,
  margin,
  cashFlow,
  dueBills,
  billMeta,
}: {
  units: Unit[];
  bookingsMonth: Booking[];
  employees: Employee[];
  monthRangeStart: string;
  monthRangeEnd: string;
  calendarBlocksOccupancy: OccupancyBlock[];
  unitStatus: (unit: Unit) => { label: string; dot: string };
  todayIso: string;
  monthIncome: number;
  expectedMonthIncome: number;
  billsPaidMonthCentavos: number;
  billsDueMonthCentavos: number;
  overdueCentavos: number;
  accruedStaffSalary: number;
  upcomingStaffSalary: number;
  netProfit: number;
  forecastProfit: number;
  margin: number;
  cashFlow: number;
  dueBills: Bill[];
  billMeta: (b: Bill) => { icon: string; label: string; sub: string };
}) {
  const [reportYear, reportMonthNum] = todayIso.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(reportYear, reportMonthNum, 0)).getUTCDate();
  const reportMonthLabel = fmtDate(new Date(todayIso), { month: "long", year: "numeric", timeZone: "Asia/Manila" });
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
        ["Booked nights", String(monthlyOccupancyData.occupiedNights)],
        ["Payroll", p(monthlyPayrollTotal)],
      ],
      stayMix: (["Daycation", "Night", "Full"] as const)
        .map((k) => [STAY_TYPES[k].label, String(monthlyStayCounts[k]), `${Math.round((monthlyStayCounts[k] / monthlyStayTotal) * 100)}%`])
        .concat([["Total", String(monthlyStayCounts.Daycation + monthlyStayCounts.Night + monthlyStayCounts.Full), "100%"]]),
      listings: units.map((u) => [formatUnitDisplay(u.unitNumber, u.name), unitStatus(u).label, p(u.nightlyRate), p(perUnitMonthlyEarned.get(u.id) ?? 0)]),
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

  return { exportExcel, exportPDF };
}
