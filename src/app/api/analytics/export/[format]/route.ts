import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canSeeAnalytics } from "@/lib/rbac";
import { assembleExportData } from "@/app/api/analytics/export/data";
import { buildExportCsv } from "@/app/api/analytics/export/csv";
import { buildExportXlsx } from "@/app/api/analytics/export/xlsx";
import { buildExportPdf } from "@/app/api/analytics/export/pdf";
import type { AnalyticsFilters } from "@/app/analytics/queries";
import type { AnalyticsPeriodPreset } from "@/lib/analytics/period";

export async function GET(req: NextRequest, { params }: { params: { format: string } }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canSeeAnalytics(user.role)) return new Response("Forbidden", { status: 403 });

  const format = params.format;
  if (!["csv", "xlsx", "pdf"].includes(format)) {
    return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const filters: AnalyticsFilters = {
    preset: (sp.get("period") as AnalyticsPeriodPreset) || "month",
    customStart: sp.get("start") ?? undefined,
    customEnd: sp.get("end") ?? undefined,
    unitIds: sp.get("units") ? sp.get("units")!.split(",").filter(Boolean) : null,
  };

  // Reuses the exact same section queries the page itself renders from —
  // an export can never show a number the page didn't already show.
  const data = await assembleExportData({ role: user.role, ownedUnitIds: user.ownedUnitIds }, filters);

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `analytics-${filters.preset}-${datePart}.${format}`;

  if (format === "csv") {
    const csv = buildExportCsv(data);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  }
  if (format === "xlsx") {
    const buf = buildExportXlsx(data);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  }
  const buf = await buildExportPdf(data);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
