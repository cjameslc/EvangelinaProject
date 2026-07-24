import { peso, fmtDate } from "@/lib/format";
import type { LaundryOrderView } from "@/lib/laundry/laundryReports";

/** Flat, spreadsheet-ready rows — one per order, shared by all three export formats so csv/xlsx/pdf can never disagree on what a column means. */
export function laundryExportRows(orders: LaundryOrderView[]) {
  return orders.map((o) => ({
    "Order Number": o.orderNumber,
    "Customer Name": o.customerName,
    "Room Number": o.roomNumber ?? "—",
    "Date Received": fmtDate(o.dateReceived, { month: "short", day: "numeric", year: "numeric" }),
    "Due Date": fmtDate(o.dueDate, { month: "short", day: "numeric", year: "numeric" }),
    "Service": o.service.name,
    "Status": o.status,
    "Payment Status": o.paymentStatus,
    "Total Weight (kg)": o.totalWeight,
    "Total Amount": peso(o.totalAmount),
    "Amount Paid": peso(o.amountPaid),
    "Balance Due": peso(o.balanceDue),
    "Assigned Staff": o.assignedStaff?.name ?? "—",
  }));
}
