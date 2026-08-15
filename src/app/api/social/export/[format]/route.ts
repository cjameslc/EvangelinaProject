import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { canSeeSocialMedia } from "@/lib/rbac";
import { unitIdWhere } from "@/lib/session";
import { computeMonthAvailability } from "@/lib/socialAvailability";
import { formatUnitDisplay } from "@/lib/format";

async function loadRows(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  if (!canSeeSocialMedia(user.role)) return { error: new Response("Forbidden", { status: 403 }) } as const;

  const sp = req.nextUrl.searchParams;
  const monthParam = sp.get("month"); // "YYYY-MM"
  const [y, m] = monthParam ? monthParam.split("-").map(Number) : [new Date().getUTCFullYear(), new Date().getUTCMonth() + 1];
  const year = y || new Date().getUTCFullYear();
  const month0 = (m || 1) - 1;
  const unitId = sp.get("unitId");
  const stayType = sp.get("stayType") || "all";

  const units = await prisma.unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, select: { id: true, unitNumber: true, shortName: true } });
  const scopedUnits = unitId && unitId !== "all" ? units.filter((u) => u.id === unitId) : units;

  const monthStart = new Date(Date.UTC(year, month0, 1));
  const monthEnd = new Date(Date.UTC(year, month0 + 1, 1));
  const bookings = await prisma.booking.findMany({
    where: { unitId: { in: scopedUnits.map((u) => u.id) }, cancelledAt: null, date: { lt: monthEnd }, OR: [{ checkOutDate: { gte: monthStart } }, { checkOutDate: null }] },
    select: { unitId: true, date: true, checkOutDate: true, stayType: true },
  });

  const days = computeMonthAvailability(scopedUnits, bookings, year, month0, stayType);
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const unitLabel = unitId && unitId !== "all" ? formatUnitDisplay(scopedUnits[0]?.unitNumber, scopedUnits[0]?.shortName) : "All units";
  const owner = await prisma.owner.findUnique({ where: { id: user.ownerId! }, select: { businessName: true } });

  return { ok: true, days, monthLabel, unitLabel, units: scopedUnits, businessName: owner?.businessName ?? "Evangelina's Staycation" } as const;
}

export async function GET(req: NextRequest, { params }: { params: { format: string } }) {
  if (!["pdf", "xlsx"].includes(params.format)) {
    return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
  }

  const loaded = await loadRows(req);
  if ("error" in loaded) return loaded.error;
  const { days, monthLabel, unitLabel, businessName } = loaded;

  const filename = `available-dates-${monthLabel.replace(/\s/g, "-").toLowerCase()}.${params.format}`;

  if (params.format === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [`Available Dates — ${monthLabel}`],
      [`Scope: ${unitLabel}`],
      [],
      ["Date", "Status", "Units available", "Units occupied"],
      ...days.map((d) => [
        d.iso,
        d.status === "available" ? "Available" : d.status === "partial" ? "Partially reserved" : "Fully booked",
        String(d.availableUnitIds.length),
        String(d.occupiedUnitIds.length),
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, "Available Dates");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  }

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF();
  const rausch: [number, number, number] = [255, 56, 92];
  const green: [number, number, number] = [13, 158, 110];
  const amber: [number, number, number] = [200, 125, 0];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(businessName, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(`Available Dates — ${monthLabel} · ${unitLabel}`, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    theme: "plain",
    head: [["Date", "Status", "Units open", "Units occupied"]],
    body: days.map((d) => [
      new Date(`${d.iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      d.status === "available" ? "Available" : d.status === "partial" ? "Partially reserved" : "Fully booked",
      String(d.availableUnitIds.length),
      String(d.occupiedUnitIds.length),
    ]),
    headStyles: { fillColor: rausch, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.1 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 1) {
        const v = data.cell.raw;
        data.cell.styles.textColor = v === "Available" ? green : v === "Fully booked" ? rausch : amber;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const buf = doc.output("arraybuffer");
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
