"use client";

import dynamic from "next/dynamic";
import { StatCard } from "@/components/ui/StatCard";
import { peso, fmtDate, fmtTime } from "@/lib/format";
import { LAUNDRY_STATUS_COLOR } from "./laundryStatusMeta";
import type { LaundryDashboardData } from "./types";

function ChartSkeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-xl bg-[var(--bg-2)]" style={{ height }} />;
}

const LaundryOrdersChart = dynamic(() => import("./charts/LaundryOrdersChart").then((m) => m.LaundryOrdersChart), { ssr: false, loading: () => <ChartSkeleton height={220} /> });
const LaundryRevenueChart = dynamic(() => import("./charts/LaundryRevenueChart").then((m) => m.LaundryRevenueChart), { ssr: false, loading: () => <ChartSkeleton height={220} /> });
const LaundryStatusChart = dynamic(() => import("./charts/LaundryStatusChart").then((m) => m.LaundryStatusChart), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

export function LaundryDashboard({ data, onOpenOrder }: { data: LaundryDashboardData; onOpenOrder: (id: string) => void }) {
  const { stats } = data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total orders" value={stats.totalOrders} />
        <StatCard label="Received today" value={stats.receivedToday} />
        <StatCard label="In progress" value={stats.inProgress} />
        <StatCard label="Ready for pickup" value={stats.readyForPickup} warn={stats.readyForPickup > 0} tone="caution" />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="Overdue" value={stats.overdue} warn={stats.overdue > 0} />
        <StatCard label="Today's revenue" value={peso(stats.todaysRevenue)} />
        <StatCard label="Monthly revenue" value={peso(stats.monthlyRevenue)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h3 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Daily laundry orders</h3>
          <LaundryOrdersChart data={data.dailyOrders} />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Revenue trend</h3>
          <LaundryRevenueChart data={data.revenueTrend} />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Order status distribution</h3>
          <LaundryStatusChart data={data.statusDistribution} />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="p-4 pb-2">
          <h3 className="text-[14px] font-extrabold">Recent orders</h3>
        </div>
        {data.recentOrders.length === 0 ? (
          <p className="p-4 pt-1 text-[13px] text-[var(--gray)]">No laundry orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-t border-[var(--line)] text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
                  <th className="px-4 py-2">Order #</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Room</th>
                  <th className="px-4 py-2">Received</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Payment</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.id} onClick={() => onOpenOrder(o.id)} className="cursor-pointer border-t border-[var(--line)] hover:bg-[var(--bg-2)]">
                    <td className="px-4 py-2.5 font-mono font-bold">{o.orderNumber}</td>
                    <td className="px-4 py-2.5">{o.customerName}</td>
                    <td className="px-4 py-2.5 text-[var(--gray)]">{o.roomNumber ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--gray)]">{fmtDate(o.dateReceived, { month: "short", day: "numeric" })}</td>
                    <td className="px-4 py-2.5 text-[var(--gray)]">{fmtDate(o.dueDate, { month: "short", day: "numeric" })} · {fmtTime(o.dueDate)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: `${LAUNDRY_STATUS_COLOR[o.status]}1A`, color: LAUNDRY_STATUS_COLOR[o.status] }}>{o.status}</span>
                    </td>
                    <td className="px-4 py-2.5">{o.paymentStatus}</td>
                    <td className="px-4 py-2.5 text-right font-bold">{peso(o.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
