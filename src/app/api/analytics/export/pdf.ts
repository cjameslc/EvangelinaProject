import { peso, pesoCentavos, fmtDate } from "@/lib/format";
import type { ExportData } from "@/app/api/analytics/export/data";

/**
 * Same jsPDF + jspdf-autotable pattern already used client-side for
 * Dashboard/Earnings exports — dynamically imported here too, so it's
 * only ever loaded when someone actually hits the export route, not on
 * every request to this file's module graph. Runs server-side (a real
 * PDF buffer via doc.output("arraybuffer") instead of doc.save()) so a
 * large custom-range export never has the client hold the assembled data
 * just to build the file.
 */
export async function buildExportPdf(data: ExportData): Promise<Buffer> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF();
  const rausch: [number, number, number] = [255, 56, 92];
  const tableOpts: any = {
    theme: "plain",
    headStyles: { fillColor: rausch, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.1 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Evangelina's Staycation", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(`Analytics report — ${fmtDate(data.periodStart, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} to ${fmtDate(new Date(data.periodEnd.getTime() - 86400000), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`, 14, 25);
  doc.setTextColor(0);

  let y = 32;
  const nextTable = (opts: any) => {
    if (y > 250) { doc.addPage(); y = 20; }
    autoTable(doc, { ...tableOpts, startY: y, ...opts });
    y = (doc as any).lastAutoTable.finalY + 8;
  };

  nextTable({
    head: [["Executive KPIs", ""]],
    body: [
      ["Total Revenue", pesoCentavos(data.kpis.totalRevenueCentavos)],
      ["Net Profit", pesoCentavos(data.kpis.netProfitCentavos)],
      ["Occupancy Rate", `${data.kpis.occupancyPct}%`],
      ["ADR", peso(Math.round(data.kpis.adrCentavos / 100))],
      ["RevPAR", peso(Math.round(data.kpis.revparCentavos / 100))],
      ["Total Bookings", String(data.kpis.totalBookings)],
      ["Cancellation Rate", `${data.kpis.cancellationRatePct}%`],
      ["Repeat Guest Rate", `${data.kpis.repeatGuestRatePct}%`],
      ["Monthly Forecast", `${pesoCentavos(data.kpis.monthlyForecastCentavos)} (${data.kpis.forecastConfidence} confidence)`],
    ],
  });

  nextTable({ head: [["Revenue by Unit", "Revenue", "Bookings"]], body: data.revenue.byUnit.map((r) => [r.label, pesoCentavos(r.collectedCentavos), String(r.count)]) });

  nextTable({
    head: [["Financial", ""]],
    body: [
      ["Gross Revenue", pesoCentavos(data.financial.grossRevenueCentavos)],
      ["Net Revenue", pesoCentavos(data.financial.netRevenueCentavos)],
      ["Paid Expenses", pesoCentavos(data.financial.paidExpensesCentavos)],
      ["Cash Flow", pesoCentavos(data.financial.cashFlowCentavos)],
      ["Outstanding Payments", pesoCentavos(data.financial.outstandingBalanceCentavos)],
    ],
  });

  nextTable({ head: [["Booking Funnel", "Count"]], body: data.booking.funnel.map((f) => [f.stage, String(f.count)]) });

  nextTable({
    head: [["Occupancy", ""]],
    body: [
      ["Occupancy Rate", `${data.occupancy.occupancyPct}%`],
      ["Occupied Nights", String(data.occupancy.occupiedNights)],
      ["Maintenance Nights", String(data.occupancy.maintenanceNights)],
    ],
  });

  nextTable({
    head: [["Staff", "Role", "Total Earned"]],
    body: data.staff.rows.length ? data.staff.rows.map((s) => [s.name, s.role, pesoCentavos(s.totalEarnedCentavos)]) : [["No staff activity this period", "", peso(0)]],
  });

  nextTable({
    head: [["Unit", "Occupancy", "Revenue", "Profit"]],
    body: data.units.rows.map((u) => [u.name, `${u.occupancyPct}%`, pesoCentavos(u.revenueCentavos), pesoCentavos(u.profitCentavos)]),
  });

  return Buffer.from(doc.output("arraybuffer"));
}
