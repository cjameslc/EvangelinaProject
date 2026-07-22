import * as XLSX from "xlsx";
import { peso, pesoCentavos } from "@/lib/format";
import type { ExportData } from "@/app/api/analytics/export/data";

/** Real multi-sheet .xlsx via the xlsx package already used elsewhere in this app for parsing imports — this is its first use as a writer. */
export function buildExportXlsx(data: ExportData): Buffer {
  const wb = XLSX.utils.book_new();

  const kpiSheet = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total Revenue", pesoCentavos(data.kpis.totalRevenueCentavos)],
    ["Net Profit", pesoCentavos(data.kpis.netProfitCentavos)],
    ["Occupancy Rate", `${data.kpis.occupancyPct}%`],
    ["ADR", peso(Math.round(data.kpis.adrCentavos / 100))],
    ["RevPAR", peso(Math.round(data.kpis.revparCentavos / 100))],
    ["Total Bookings", data.kpis.totalBookings],
    ["Cancellation Rate", `${data.kpis.cancellationRatePct}%`],
    ["Avg Stay Length", `${data.kpis.avgStayLengthNights} nights`],
    ["Repeat Guest Rate", `${data.kpis.repeatGuestRatePct}%`],
    ["Monthly Forecast", `${pesoCentavos(data.kpis.monthlyForecastCentavos)} (${data.kpis.forecastMethod}, ${data.kpis.forecastConfidence} confidence)`],
  ]);
  XLSX.utils.book_append_sheet(wb, kpiSheet, "Executive KPIs");

  const revenueSheet = XLSX.utils.aoa_to_sheet([
    ["Revenue by Unit"],
    ["Unit", "Revenue", "Bookings"],
    ...data.revenue.byUnit.map((r) => [r.label, pesoCentavos(r.collectedCentavos), r.count]),
    [],
    ["Revenue by Source"],
    ["Source", "Revenue", "Bookings"],
    ...data.revenue.bySource.map((r) => [r.label, pesoCentavos(r.collectedCentavos), r.count]),
    [],
    ["Revenue by Stay Type"],
    ["Stay Type", "Revenue", "Bookings"],
    ...data.revenue.byStayType.map((r) => [r.label, pesoCentavos(r.collectedCentavos), r.count]),
  ]);
  XLSX.utils.book_append_sheet(wb, revenueSheet, "Revenue");

  const financialSheet = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Gross Revenue", pesoCentavos(data.financial.grossRevenueCentavos)],
    ["Net Revenue", pesoCentavos(data.financial.netRevenueCentavos)],
    ["Paid Expenses", pesoCentavos(data.financial.paidExpensesCentavos)],
    ["Pending Expenses", pesoCentavos(data.financial.pendingExpensesCentavos)],
    ["Cash Flow", pesoCentavos(data.financial.cashFlowCentavos)],
    ["Outstanding Payments", pesoCentavos(data.financial.outstandingBalanceCentavos)],
  ]);
  XLSX.utils.book_append_sheet(wb, financialSheet, "Financial");

  const bookingSheet = XLSX.utils.aoa_to_sheet([
    ["Booking Funnel"],
    ["Stage", "Count"],
    ...data.booking.funnel.map((f) => [f.stage, f.count]),
    [],
    ["Lead Time"],
    ["Bucket", "Count"],
    ...data.booking.leadTime.map((l) => [l.bucket, l.count]),
  ]);
  XLSX.utils.book_append_sheet(wb, bookingSheet, "Bookings");

  const occupancySheet = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Occupancy Rate", `${data.occupancy.occupancyPct}%`],
    ["Occupied Nights", data.occupancy.occupiedNights],
    ["Maintenance Nights", data.occupancy.maintenanceNights],
    ["Cleaning Nights", data.occupancy.cleaningNights],
    ["Occupancy Forecast", `${data.occupancy.forecastPct}% (${data.occupancy.forecastMethod})`],
  ]);
  XLSX.utils.book_append_sheet(wb, occupancySheet, "Occupancy");

  const guestSheet = XLSX.utils.aoa_to_sheet([
    ["Top Guests (by lifetime spend)"],
    ["Guest", "Lifetime Spend", "Bookings"],
    ...data.guest.topGuests.map((g) => [g.name, pesoCentavos(g.totalCentavos), g.bookingCount]),
  ]);
  XLSX.utils.book_append_sheet(wb, guestSheet, "Guests");

  const staffSheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Role", "Bookings Logged", "Cleanings Completed", "Total Earned"],
    ...data.staff.rows.map((s) => [s.name, s.role, s.bookingsLogged, s.cleaningsCompleted, pesoCentavos(s.totalEarnedCentavos)]),
  ]);
  XLSX.utils.book_append_sheet(wb, staffSheet, "Staff");

  const unitSheet = XLSX.utils.aoa_to_sheet([
    ["Unit", "Occupancy", "Revenue", "Expenses", "Profit", "Bookings", "Rating"],
    ...data.units.rows.map((u) => [u.name, `${u.occupancyPct}%`, pesoCentavos(u.revenueCentavos), pesoCentavos(u.expensesCentavos), pesoCentavos(u.profitCentavos), u.bookingCount, u.rating.toFixed(1)]),
  ]);
  XLSX.utils.book_append_sheet(wb, unitSheet, "Units");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
