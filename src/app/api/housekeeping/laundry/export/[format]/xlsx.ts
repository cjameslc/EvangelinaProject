import * as XLSX from "xlsx";
import { laundryExportRows } from "./data";
import type { LaundryOrderView } from "@/lib/laundry/laundryReports";

export function buildLaundryExportXlsx(orders: LaundryOrderView[]): Buffer {
  const wb = XLSX.utils.book_new();
  const rows = laundryExportRows(orders);
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Order Number": "No laundry orders in this view." }]);
  XLSX.utils.book_append_sheet(wb, sheet, "Laundry Orders");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
