import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canSeeHousekeeping } from "@/lib/rbac";
import { listLaundryOrdersForUser } from "@/lib/laundry/laundryService";
import { withDerived } from "@/lib/laundry/laundryReports";
import { buildLaundryExportCsv } from "./csv";
import { buildLaundryExportXlsx } from "./xlsx";
import { buildLaundryExportPdf } from "./pdf";

export async function GET(_req: NextRequest, { params }: { params: { format: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const format = params.format;
  if (!["csv", "xlsx", "pdf"].includes(format)) {
    return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
  }

  const rows = await listLaundryOrdersForUser(user);
  const orders = rows.map(withDerived);
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `laundry-orders-${datePart}.${format}`;

  if (format === "csv") {
    return new Response(buildLaundryExportCsv(orders), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  }
  if (format === "xlsx") {
    const buf = buildLaundryExportXlsx(orders);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  }
  const buf = await buildLaundryExportPdf(orders);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
