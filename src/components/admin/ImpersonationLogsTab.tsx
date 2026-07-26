"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { ROLE_LABEL } from "@/lib/constants";
import { fmtDate, fmtTime, initials } from "@/lib/format";
import { SearchIcon } from "@/components/ui/Icons";

export type ImpersonationLog = {
  id: string;
  adminUserId: string;
  adminName: string;
  adminUsername: string;
  targetUserId: string;
  targetName: string;
  targetUsername: string;
  targetRole: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
};

const PAGE_SIZE = 20;

// 30-minute cap matches the sliding-inactivity window enforced server-side
// (src/middleware.ts) — a row with no endedAt older than that is treated as
// implicitly timed-out here even if the DB row wasn't finalized (e.g. the
// admin closed the tab instead of clicking "Return to My Account" and never
// made another request for the force-stop redirect to fire on).
const IMPLICIT_TIMEOUT_MS = 30 * 60 * 1000;

function isEffectivelyActive(log: ImpersonationLog): boolean {
  if (log.endedAt) return false;
  return Date.now() - new Date(log.startedAt).getTime() < IMPLICIT_TIMEOUT_MS;
}

function deviceFromUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const isMobile = /Mobi|Android/i.test(ua);
  const os = /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : "Unknown OS";
  const browser = /Edg\//i.test(ua) ? "Edge" : /Chrome\//i.test(ua) ? "Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "Unknown browser";
  return `${browser} · ${os}${isMobile ? " · Mobile" : ""}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ImpersonationLogsTab({ logs }: { logs: ImpersonationLog[] }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [adminFilter, setAdminFilter] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const admins = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of logs) map.set(l.adminUserId, l.adminName);
    return [...map.entries()];
  }, [logs]);
  const roles = useMemo(() => [...new Set(logs.map((l) => l.targetRole))], [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (roleFilter !== "all" && l.targetRole !== roleFilter) return false;
      if (adminFilter !== "all" && l.adminUserId !== adminFilter) return false;
      if (activeOnly && !isEffectivelyActive(l)) return false;
      if (dateFrom && new Date(l.startedAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(l.startedAt) > new Date(dateTo + "T23:59:59")) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${l.adminName} ${l.adminUsername} ${l.targetName} ${l.targetUsername} ${l.reason ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, roleFilter, adminFilter, activeOnly, dateFrom, dateTo]);

  useEffect(() => setPage(1), [search, roleFilter, adminFilter, activeOnly, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = logs.filter(isEffectivelyActive).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <p className="text-[13.5px] text-[var(--gray)]">{logs.length} session{logs.length !== 1 ? "s" : ""} logged · {activeCount} active now.</p>
        <div className="relative ml-auto min-w-[180px] flex-1 sm:flex-none">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search admin, resource, reason" className="field-input pl-10" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All admins</option>
          {admins.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="field-input w-auto" title="From date" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="field-input w-auto" title="To date" />
        <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-[13px] font-semibold">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="h-4 w-4 accent-rausch" />
          Active sessions only
        </label>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No impersonation sessions" sub="Sessions started from Users & roles will show up here." />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {paged.map((l) => {
              const active = isEffectivelyActive(l);
              return (
                <div key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gradient-to-br from-[#F59E0B] to-[#EA580C] text-[12px] font-bold text-white">
                    {initials(l.targetName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
                      <span className="font-bold">{l.adminName}</span>
                      <span className="text-[var(--gray)]">logged in as</span>
                      <span className="font-bold">{l.targetName}</span>
                      <span className="rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10.5px] font-bold text-[#B45309]">{ROLE_LABEL[l.targetRole] ?? l.targetRole}</span>
                      {active && <span className="rounded-full bg-green/15 px-2 py-0.5 text-[10.5px] font-bold text-green">● Active</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--gray)]">
                      @{l.adminUsername} → @{l.targetUsername}{l.reason && <span> · &ldquo;{l.reason}&rdquo;</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--gray)]">
                      <span>{deviceFromUserAgent(l.userAgent)}</span>
                      {l.ipAddress && <span>IP {l.ipAddress}</span>}
                      {l.endReason && !active && <span>Ended: {l.endReason === "manual" ? "manual" : l.endReason === "timeout" ? "timed out" : l.endReason === "admin_logout" ? "admin logged out" : l.endReason}</span>}
                    </div>
                  </div>
                  <div className="flex-none text-right text-[12px] text-[var(--gray)]">
                    <div className="font-semibold text-[var(--ink)]">{fmtDate(l.startedAt, { month: "short", day: "numeric", year: "numeric" })}</div>
                    <div>{fmtTime(l.startedAt)}</div>
                    <div className="mt-0.5 font-semibold text-[var(--ink)]">{active ? "In progress" : formatDuration(l.durationSeconds)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalLabel={`${filtered.length} session${filtered.length !== 1 ? "s" : ""}`} />
    </div>
  );
}
