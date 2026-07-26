import { peso, pesoCentavos, formatUnitDisplay } from "@/lib/format";
import type { ExportData } from "@/app/api/analytics/export/data";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Same manual CSV-building approach Dashboard's exportExcel() already uses (client-side there, server-side here) — a BOM + \r\n line endings so it opens cleanly in Excel. */
export function buildExportCsv(data: ExportData): string {
  const lines: string[] = [];
  const section = (title: string) => { lines.push(""); lines.push(title); };
  const row = (...cells: (string | number)[]) => lines.push(cells.map(csvCell).join(","));

  section("Executive KPIs");
  row("Total Revenue", pesoCentavos(data.kpis.totalRevenueCentavos));
  row("Net Profit", pesoCentavos(data.kpis.netProfitCentavos));
  row("Occupancy Rate", `${data.kpis.occupancyPct}%`);
  row("ADR", peso(Math.round(data.kpis.adrCentavos / 100)));
  row("RevPAR", peso(Math.round(data.kpis.revparCentavos / 100)));
  row("Total Bookings", data.kpis.totalBookings);
  row("Cancellation Rate", `${data.kpis.cancellationRatePct}%`);
  row("Avg Stay Length", `${data.kpis.avgStayLengthNights} nights`);
  row("Repeat Guest Rate", `${data.kpis.repeatGuestRatePct}%`);
  row("Monthly Forecast", `${pesoCentavos(data.kpis.monthlyForecastCentavos)} (${data.kpis.forecastMethod}, ${data.kpis.forecastConfidence} confidence)`);

  section("Revenue by Unit");
  row("Unit", "Revenue", "Bookings");
  data.revenue.byUnit.forEach((r) => row(r.label, pesoCentavos(r.collectedCentavos), r.count));

  section("Revenue by Source");
  row("Source", "Revenue", "Bookings");
  data.revenue.bySource.forEach((r) => row(r.label, pesoCentavos(r.collectedCentavos), r.count));

  section("Financial");
  row("Gross Revenue", pesoCentavos(data.financial.grossRevenueCentavos));
  row("Net Revenue", pesoCentavos(data.financial.netRevenueCentavos));
  row("Paid Expenses", pesoCentavos(data.financial.paidExpensesCentavos));
  row("Pending Expenses", pesoCentavos(data.financial.pendingExpensesCentavos));
  row("Cash Flow", pesoCentavos(data.financial.cashFlowCentavos));
  row("Outstanding Payments", pesoCentavos(data.financial.outstandingBalanceCentavos));

  section("Booking Funnel");
  data.booking.funnel.forEach((f) => row(f.stage, f.count));

  section("Occupancy");
  row("Occupancy Rate", `${data.occupancy.occupancyPct}%`);
  row("Occupied Nights", data.occupancy.occupiedNights);
  row("Maintenance Nights", data.occupancy.maintenanceNights);
  row("Cleaning Nights", data.occupancy.cleaningNights);

  section("Top Guests");
  row("Guest", "Lifetime Spend", "Bookings");
  data.guest.topGuests.forEach((g) => row(g.name, pesoCentavos(g.totalCentavos), g.bookingCount));

  section("Housekeeping");
  row("Completed Tasks", data.housekeeping.completed);
  row("Pending Tasks", data.housekeeping.pending);
  row("Avg Cleaning Time (min)", data.housekeeping.avgDurationMinutes);
  row("Rooms Ready", data.housekeeping.roomsReady);

  section("Staff Performance");
  row("Name", "Role", "Bookings Logged", "Cleanings Completed", "Total Earned");
  data.staff.rows.forEach((s) => row(s.name, s.role, s.bookingsLogged, s.cleaningsCompleted, pesoCentavos(s.totalEarnedCentavos)));

  section("Unit Performance");
  row("Unit", "Occupancy", "Revenue", "Expenses", "Profit", "Bookings", "Rating");
  data.units.rows.forEach((u) => row(formatUnitDisplay(u.unitNumber, u.name), `${u.occupancyPct}%`, pesoCentavos(u.revenueCentavos), pesoCentavos(u.expensesCentavos), pesoCentavos(u.profitCentavos), u.bookingCount, u.rating.toFixed(1)));

  return "﻿" + lines.join("\r\n");
}
