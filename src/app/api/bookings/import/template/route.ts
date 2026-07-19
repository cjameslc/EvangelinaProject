import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canEditBookings } from "@/lib/rbac";
import { IMPORT_TEMPLATE_HEADERS, IMPORT_TEMPLATE_SAMPLE_ROW } from "@/lib/bookingImport";

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const lines = [
    IMPORT_TEMPLATE_HEADERS.map(csvCell).join(","),
    IMPORT_TEMPLATE_SAMPLE_ROW.map(csvCell).join(","),
  ];
  const csv = lines.join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="booking-import-template.csv"',
    },
  });
}
