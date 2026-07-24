import { manilaDayStart } from "@/lib/format";
import { paymentStatusFor, remainingBalance, isOverdue, type PaymentStatus } from "@/lib/laundry/laundryPricing";
import type { laundryOrderSelect } from "@/lib/laundry/laundryService";
import type { Prisma } from "@prisma/client";

export type LaundryOrderRow = Prisma.LaundryOrderGetPayload<{ select: typeof laundryOrderSelect }>;

export type LaundryOrderView = LaundryOrderRow & { amountPaid: number; paymentStatus: PaymentStatus; balanceDue: number; overdue: boolean };

/** Attaches the derived fields (see laundryPricing.ts) every UI surface
 * needs — one place, so a list row, the detail page, and the dashboard
 * never disagree on what "overdue" or "Paid" means. */
export function withDerived(order: LaundryOrderRow): LaundryOrderView {
  const amountPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
  return {
    ...order,
    amountPaid,
    paymentStatus: paymentStatusFor(order.totalAmount, amountPaid),
    balanceDue: remainingBalance(order.totalAmount, amountPaid),
    overdue: isOverdue(order.dueDate, order.status),
  };
}

const dayOf = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

export function computeLaundryDashboard(orders: LaundryOrderView[]) {
  const todayIso = dayOf(new Date());
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const receivedToday = orders.filter((o) => dayOf(o.dateReceived) === todayIso).length;
  const inProgress = orders.filter((o) => !["Received", "Ready for Pickup", "Delivered", "Cancelled"].includes(o.status)).length;
  const readyForPickup = orders.filter((o) => o.status === "Ready for Pickup").length;
  const completed = orders.filter((o) => o.status === "Delivered").length;
  const overdueCount = orders.filter((o) => o.overdue).length;
  const todaysRevenue = orders.filter((o) => o.status !== "Cancelled").flatMap((o) => o.payments).filter((p) => dayOf(p.createdAt) === todayIso).reduce((sum, p) => sum + p.amount, 0);
  const monthlyRevenue = orders.filter((o) => o.status !== "Cancelled").flatMap((o) => o.payments).filter((p) => new Date(p.createdAt) >= monthStart).reduce((sum, p) => sum + p.amount, 0);

  // Last 14 days — orders received per day + revenue collected per day.
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = manilaDayStart();
    d.setUTCDate(d.getUTCDate() - (13 - i));
    return d;
  });
  const dailyOrders = days.map((d) => ({
    label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d),
    count: orders.filter((o) => dayOf(o.dateReceived) === dayOf(d)).length,
  }));
  const revenueTrend = days.map((d) => ({
    label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d),
    revenue: orders.flatMap((o) => o.payments).filter((p) => dayOf(p.createdAt) === dayOf(d)).reduce((sum, p) => sum + p.amount, 0) / 1,
  }));

  const statusDistribution = ["Received", "Washing", "Drying", "Ironing", "Folding", "Ready for Pickup", "Delivered", "Cancelled"]
    .map((status) => ({ key: status, label: status, count: orders.filter((o) => o.status === status).length }))
    .filter((s) => s.count > 0);

  return {
    stats: {
      totalOrders: orders.length,
      receivedToday,
      inProgress,
      readyForPickup,
      completed,
      overdue: overdueCount,
      todaysRevenue,
      monthlyRevenue,
    },
    dailyOrders,
    revenueTrend,
    statusDistribution,
    recentOrders: orders.slice(0, 10),
  };
}

export type LaundryReportRange = "daily" | "weekly" | "monthly";

export function computeLaundryReports(orders: LaundryOrderView[]) {
  const activeOrders = orders.filter((o) => o.status !== "Cancelled");
  const totalRevenue = activeOrders.flatMap((o) => o.payments).reduce((sum, p) => sum + p.amount, 0);
  const totalVolumeKg = Math.round(activeOrders.reduce((sum, o) => sum + o.totalWeight, 0) * 100) / 100;

  const ordersByStatus = ["Received", "Washing", "Drying", "Ironing", "Folding", "Ready for Pickup", "Delivered", "Cancelled"]
    .map((status) => ({ status, count: orders.filter((o) => o.status === status).length }));

  const outstandingPayments = orders.filter((o) => o.status !== "Cancelled" && o.balanceDue > 0);
  const outstandingTotal = outstandingPayments.reduce((sum, o) => sum + o.balanceDue, 0);

  const byService = new Map<string, { name: string; count: number }>();
  for (const o of activeOrders) {
    const key = o.service.id;
    if (!byService.has(key)) byService.set(key, { name: o.service.name, count: 0 });
    byService.get(key)!.count++;
  }
  const mostRequestedServices = [...byService.values()].sort((a, b) => b.count - a.count);

  // Average processing time (Received -> Delivered), approximated from
  // updatedAt - createdAt on delivered orders — the order's own audit
  // trail (LaundryStatusHistory) has the exact per-status timestamps for
  // any single order's detail view, but summarizing across every order
  // here from that table would mean a much heavier query for a report
  // figure that doesn't need per-status precision, just the overall span.
  const delivered = activeOrders.filter((o) => o.status === "Delivered");
  const avgProcessingHours = delivered.length
    ? Math.round((delivered.reduce((sum, o) => sum + (new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()), 0) / delivered.length / 3600000) * 10) / 10
    : 0;

  return {
    totalRevenue,
    totalVolumeKg,
    ordersByStatus,
    outstandingPayments,
    outstandingTotal,
    mostRequestedServices,
    avgProcessingHours,
  };
}
