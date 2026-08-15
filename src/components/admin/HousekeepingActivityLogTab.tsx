"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { fmtDate, fmtTime, initials } from "@/lib/format";
import { SearchIcon } from "@/components/ui/Icons";

type LogRow = {
  id: string;
  action: string;
  entityId: string | null;
  meta: any;
  createdAt: string;
  actor: { id: string; name: string; username: string; role: string } | null;
};

const ACTION_LABEL: Record<string, string> = {
  "housekeeping.update": "Cleaning status updated",
  "shift.clockin": "Logged in",
  "shift.clockout": "Logged out",
  "access.credential.generated": "Temporary code generated",
  "access.credential.viewed": "Code viewed",
  "access.credential.copied": "Code copied",
  "access.credential.revoked": "Credential revoked",
  "access.credential.expired": "Credential expired",
  "access.credential.failed": "Code generation failed",
};

const PAGE_SIZE = 25;

// Spec section 15 — a dedicated operational timeline for Housekeeping
// Workforce Management, read straight off the existing AuditLog (see
// admin/page.tsx's query) rather than a bespoke log table — every write
// path this feature touches already calls the app's one logAudit() seam.
export function HousekeepingActivityLogTab({ logs }: { logs: LogRow[] }) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        l.actor?.name.toLowerCase().includes(q) ||
        (typeof l.meta?.unitId === "string" && l.meta.unitId.toLowerCase().includes(q)) ||
        (typeof l.meta?.employeeName === "string" && l.meta.employeeName.toLowerCase().includes(q))
      );
    });
  }, [logs, search, action]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <p className="text-[13.5px] text-[var(--gray)]">{filtered.length} event{filtered.length !== 1 ? "s" : ""}.</p>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="field-input w-auto">
          <option value="all">All events</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray)]" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search employee or unit" className="field-input pl-10" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No activity yet" sub="Housekeeping and access-credential events will show up here." />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {paged.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gradient-to-br from-teal to-[#0B7C74] text-[12px] font-bold text-white">
                  {l.actor ? initials(l.actor.name) : "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold">{ACTION_LABEL[l.action] ?? l.action}</div>
                  <div className="truncate text-[12px] text-[var(--gray)]">
                    {l.actor?.name ?? "System"}
                    {l.meta?.reason && ` · ${l.meta.reason}`}
                    {l.meta?.employeeName && ` · ${l.meta.employeeName}`}
                  </div>
                </div>
                <div className="flex-none text-right text-[12px] text-[var(--gray)]">
                  <div className="font-semibold text-[var(--ink)]">{fmtDate(l.createdAt, { month: "short", day: "numeric" })}</div>
                  <div>{fmtTime(l.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalLabel={`${filtered.length} event${filtered.length !== 1 ? "s" : ""}`} />
    </div>
  );
}
