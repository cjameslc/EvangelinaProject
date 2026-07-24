import { laundryExportRows } from "./data";
import type { LaundryOrderView } from "@/lib/laundry/laundryReports";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Same BOM + \r\n manual-CSV approach as analytics/export/csv.ts. */
export function buildLaundryExportCsv(orders: LaundryOrderView[]): string {
  const rows = laundryExportRows(orders);
  if (rows.length === 0) return "﻿No laundry orders in this view.";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvCell((row as any)[h])).join(","));
  return "﻿" + lines.join("\r\n");
}
