"use client";

import { StatCard } from "@/components/ui/StatCard";
import { peso, fmtDate } from "@/lib/format";
import { LaundryExportMenu } from "./LaundryExportMenu";
import { LAUNDRY_STATUS_COLOR } from "./laundryStatusMeta";
import type { LaundryReportsData } from "./types";

export function LaundryReports({ data, onOpenOrder }: { data: LaundryReportsData; onOpenOrder: (id: string) => void }) {
  const maxStatusCount = Math.max(1, ...data.ordersByStatus.map((s) => s.count));
  const maxServiceCount = Math.max(1, ...data.mostRequestedServices.map((s) => s.count));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--gray)]">Daily/weekly/monthly figures below are computed from every order currently loaded (not cancelled, unless noted) — export for the full underlying list.</p>
        <LaundryExportMenu />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total revenue" value={peso(data.totalRevenue)} />
        <StatCard label="Laundry volume" value={`${data.totalVolumeKg} kg`} />
        <StatCard label="Outstanding payments" value={peso(data.outstandingTotal)} warn={data.outstandingTotal > 0} tone="caution" sub={`${data.outstandingPayments.length} order${data.outstandingPayments.length === 1 ? "" : "s"}`} />
        <StatCard label="Avg. processing time" value={`${data.avgProcessingHours}h`} sub="received → delivered" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Orders by status</h3>
          <div className="space-y-2">
            {data.ordersByStatus.filter((s) => s.count > 0).map((s) => (
              <div key={s.status} className="flex items-center gap-2.5">
                <span className="w-[110px] flex-none text-[12.5px] font-semibold">{s.status}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div className="h-full rounded-full" style={{ width: `${(s.count / maxStatusCount) * 100}%`, background: LAUNDRY_STATUS_COLOR[s.status] }} />
                </div>
                <span className="w-6 flex-none text-right text-[12.5px] font-bold">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Most requested services</h3>
          {data.mostRequestedServices.length === 0 ? (
            <p className="text-[13px] text-[var(--gray)]">No orders yet.</p>
          ) : (
            <div className="space-y-2">
              {data.mostRequestedServices.map((s) => (
                <div key={s.name} className="flex items-center gap-2.5">
                  <span className="w-[130px] flex-none truncate text-[12.5px] font-semibold">{s.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
                    <div className="h-full rounded-full bg-rausch" style={{ width: `${(s.count / maxServiceCount) * 100}%` }} />
                  </div>
                  <span className="w-6 flex-none text-right text-[12.5px] font-bold">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="p-4 pb-2">
          <h3 className="text-[14px] font-extrabold">Outstanding payments</h3>
        </div>
        {data.outstandingPayments.length === 0 ? (
          <p className="p-4 pt-1 text-[13px] text-[var(--gray)]">Nothing outstanding — every active order is fully paid.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-t border-[var(--line)] text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
                  <th className="px-4 py-2">Order #</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2 text-right">Balance due</th>
                </tr>
              </thead>
              <tbody>
                {data.outstandingPayments.map((o) => (
                  <tr key={o.id} onClick={() => onOpenOrder(o.id)} className="cursor-pointer border-t border-[var(--line)] hover:bg-[var(--bg-2)]">
                    <td className="px-4 py-2.5 font-mono font-bold">{o.orderNumber}</td>
                    <td className="px-4 py-2.5">{o.customerName}</td>
                    <td className="px-4 py-2.5 text-[var(--gray)]">{fmtDate(o.dueDate, { month: "short", day: "numeric" })}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-rausch">{peso(o.balanceDue)}</td>
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
