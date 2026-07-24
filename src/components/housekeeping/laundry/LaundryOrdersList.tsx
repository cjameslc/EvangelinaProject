"use client";

import { useMemo, useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { Pagination } from "@/components/ui/Pagination";
import { SearchIcon, PlusIcon } from "@/components/ui/Icons";
import { peso, fmtDate } from "@/lib/format";
import { LAUNDRY_STATUSES, LAUNDRY_STATUS_COLOR } from "./laundryStatusMeta";
import type { LaundryOrder } from "./types";

type SortKey = "dateReceived" | "dueDate" | "customerName" | "totalAmount";
const PAGE_SIZE = 15;

export function LaundryOrdersList({
  orders, onNewOrder, onOpenOrder,
}: {
  orders: LaundryOrder[];
  onNewOrder: () => void;
  onOpenOrder: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("dateReceived");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(key);
    setSortDir("asc");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = orders.filter((o) => {
      if (q && !`${o.orderNumber} ${o.customerName} ${o.roomNumber ?? ""}`.toLowerCase().includes(q)) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (paymentFilter && o.paymentStatus !== paymentFilter) return false;
      if (dateFrom && o.dateReceived.slice(0, 10) < dateFrom) return false;
      if (dateTo && o.dateReceived.slice(0, 10) > dateTo) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "customerName") cmp = a.customerName.localeCompare(b.customerName);
      else if (sortKey === "totalAmount") cmp = a.totalAmount - b.totalAmount;
      else cmp = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [orders, search, statusFilter, paymentFilter, dateFrom, dateTo, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const clampedPage = Math.min(page, pageCount);

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="cursor-pointer select-none px-4 py-2 hover:text-[var(--ink)]" onClick={() => { toggleSort(k); setPage(1); }}>
        {label} {sortKey === k && (sortDir === "asc" ? "↑" : "↓")}
      </th>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray)]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search order #, customer, or room"
            className="field-input pl-9"
          />
        </div>
        <button onClick={onNewOrder} className="btn-primary btn-sm flex-none"><PlusIcon className="h-3.5 w-3.5" /> New order</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill on={statusFilter === null} onClick={() => { setStatusFilter(null); setPage(1); }}>All statuses</Pill>
        {LAUNDRY_STATUSES.map((s) => (
          <Pill key={s} on={statusFilter === s} color={LAUNDRY_STATUS_COLOR[s]} onClick={() => { setStatusFilter((v) => (v === s ? null : s)); setPage(1); }}>{s}</Pill>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["Unpaid", "Partial", "Paid"] as const).map((s) => (
          <Pill key={s} on={paymentFilter === s} onClick={() => { setPaymentFilter((v) => (v === s ? null : s)); setPage(1); }}>{s}</Pill>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[12.5px] text-[var(--gray)]">
          <span>Received</span>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="field-input !w-auto !py-1.5 text-[12.5px]" />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="field-input !w-auto !py-1.5 text-[12.5px]" />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {paged.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-[var(--gray)]">No laundry orders match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
                  <th className="px-4 py-2">Order #</th>
                  <SortHeader label="Customer" k="customerName" />
                  <th className="px-4 py-2">Room</th>
                  <SortHeader label="Received" k="dateReceived" />
                  <SortHeader label="Due" k="dueDate" />
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Payment</th>
                  <SortHeader label="Total" k="totalAmount" />
                </tr>
              </thead>
              <tbody>
                {paged.map((o) => (
                  <tr key={o.id} onClick={() => onOpenOrder(o.id)} className="cursor-pointer border-t border-[var(--line)] hover:bg-[var(--bg-2)]">
                    <td className="px-4 py-2.5 font-mono font-bold">{o.orderNumber}</td>
                    <td className="px-4 py-2.5">{o.customerName}</td>
                    <td className="px-4 py-2.5 text-[var(--gray)]">{o.roomNumber ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--gray)]">{fmtDate(o.dateReceived, { month: "short", day: "numeric" })}</td>
                    <td className={`px-4 py-2.5 ${o.overdue ? "font-bold text-rausch" : "text-[var(--gray)]"}`}>
                      {fmtDate(o.dueDate, { month: "short", day: "numeric" })}{o.overdue ? " · Overdue" : ""}
                    </td>
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
        <div className="px-4 pb-3">
          <Pagination page={clampedPage} pageCount={pageCount} onPageChange={setPage} totalLabel={`${filtered.length} order${filtered.length === 1 ? "" : "s"}`} />
        </div>
      </div>
    </div>
  );
}
