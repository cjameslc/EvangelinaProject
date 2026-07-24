import { laundryExportRows } from "./data";
import type { LaundryOrderView } from "@/lib/laundry/laundryReports";

/** Same jsPDF + jspdf-autotable server-side pattern as analytics/export/pdf.ts. */
export async function buildLaundryExportPdf(orders: LaundryOrderView[]): Promise<Buffer> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape" });
  const rausch: [number, number, number] = [255, 56, 92];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Evangelina's Staycation", 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text("Laundry Orders", 14, 23);
  doc.setTextColor(0);

  const rows = laundryExportRows(orders);
  const headers = rows.length ? Object.keys(rows[0]) : ["Order Number"];
  autoTable(doc, {
    theme: "plain",
    startY: 30,
    headStyles: { fillColor: rausch, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [230, 230, 230], lineWidth: 0.1 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 10, right: 10 },
    head: [headers],
    body: rows.length ? rows.map((r) => headers.map((h) => String((r as any)[h]))) : [["No laundry orders in this view."]],
  });

  return Buffer.from(doc.output("arraybuffer"));
}
