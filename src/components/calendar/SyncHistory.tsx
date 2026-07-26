"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, SearchIcon, RefreshIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import { formatUnitDisplay } from "@/lib/format";

type UnitLite = { id: string; shortName: string; unitNumber: string };
type SyncLogRow = {
  id: string;
  unitId: string;
  unit: { shortName: string; unitNumber: string };
  syncType: "AUTOMATIC" | "MANUAL";
  startedAt: string;
  durationMs: number;
  imported: number;
  updated: number;
  removed: number;
  conflicts: number;
  ok: boolean;
  error: string | null;
};
type Summary = { lastSuccessfulSync: string | null; latestOk: boolean | null; latestAt: string | null };

const PAGE_SIZE = 20;

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(iso));
}
function fmtRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
function fmtDuration(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Idle (no sync in-flight) status derived from the two cheap summary rows the API always returns. */
function idleBadge(summary: Summary | null): { label: string; cls: string } {
  if (!summary || summary.latestAt === null) return { label: "No syncs yet", cls: "bg-[var(--bg-2)] text-[var(--gray)]" };
  if (summary.latestOk === false) return { label: "Failed", cls: "bg-rausch/15 text-rausch" };
  if (!summary.lastSuccessfulSync) return { label: "Failed", cls: "bg-rausch/15 text-rausch" };
  // Background sync runs once daily — no successful sync in >26h means the
  // cron missed a run (Vercel outage, feed down, etc.), worth flagging.
  const hoursSince = (Date.now() - new Date(summary.lastSuccessfulSync).getTime()) / 3600000;
  if (hoursSince > 26) return { label: "Delayed", cls: "bg-amber/15 text-amber" };
  return { label: "Synced", cls: "bg-green/15 text-green" };
}

/**
 * Collapsed-by-default, low-emphasis "Sync History" panel for the Calendar
 * page. Deliberately quiet — small type, muted colors, compact rows — so it
 * never competes with the calendar grid above it for attention. The summary
 * header (last successful sync + status badge) is fetched on mount and after
 * every sync `refreshSignal` bump regardless of expand state; the full,
 * filterable/paginated table is fetched lazily, only once expanded.
 */
export function SyncHistory({ units, isSyncingNow, refreshSignal }: { units: UnitLite[]; isSyncingNow: boolean; refreshSignal: number }) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [logs, setLogs] = useState<SyncLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [unitFilter, setUnitFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "success" | "failed">("");
  const [typeFilter, setTypeFilter] = useState<"" | "AUTOMATIC" | "MANUAL">("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Debounce free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change should snap back to page 1.
  useEffect(() => {
    setPage(1);
  }, [unitFilter, statusFilter, typeFilter, sort, search]);

  async function fetchSummary() {
    try {
      const res = await fetch("/api/ical/sync-history?summaryOnly=1");
      if (!res.ok) return;
      const j = await res.json();
      setSummary(j.summary);
    } catch {
      // Non-fatal — the collapsed header just keeps its last-known value.
    }
  }

  const fetchIdRef = useRef(0);
  async function fetchLogs() {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setTableError(false);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
      if (unitFilter) params.set("unitId", unitFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("syncType", typeFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/ical/sync-history?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      if (fetchId !== fetchIdRef.current) return; // a newer request already landed
      setLogs(j.logs);
      setTotal(j.total);
      setSummary(j.summary);
      setHasLoadedOnce(true);
    } catch {
      if (fetchId === fetchIdRef.current) setTableError(true);
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    if (!expanded) return;
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, page, unitFilter, statusFilter, typeFilter, sort, search, refreshSignal]);

  const badge = isSyncingNow ? { label: "Syncing…", cls: "bg-blue/15 text-blue" } : idleBadge(summary);
  const activeFilterCount = (unitFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (typeFilter ? 1 : 0) + (search ? 1 : 0);

  function resetFilters() {
    setUnitFilter("");
    setStatusFilter("");
    setTypeFilter("");
    setSearchInput("");
    setSearch("");
    setSort("newest");
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="sync-history-panel"
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[11.5px] font-bold text-[var(--gray)]">Sync History</span>
          <span className="text-[11px] text-[var(--gray)]">
            {summary?.lastSuccessfulSync ? <>Last successful sync: {fmtRelative(summary.lastSuccessfulSync)}</> : "No successful sync yet"}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold", badge.cls)}>{badge.label}</span>
        </span>
        <ChevronDownIcon className={cn("h-3.5 w-3.5 flex-none text-[var(--gray)] transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div id="sync-history-panel" role="region" aria-label="Sync History details" className="border-t border-[var(--line)] px-4 py-3">
          {/* Filters */}
          <div className="mb-3 flex flex-wrap items-end gap-2.5">
            <div className="relative">
              <label htmlFor="sh-search" className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Search</label>
              <SearchIcon className="pointer-events-none absolute left-2.5 top-[27px] h-3 w-3 -translate-y-1/2 text-[var(--gray)]" />
              <input
                id="sh-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Unit or error…"
                className="field-input h-8 w-[160px] py-1 pl-7 text-[12px]"
              />
            </div>
            <div>
              <label htmlFor="sh-unit" className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Unit</label>
              <select id="sh-unit" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="field-input h-8 py-1 text-[12px]">
                <option value="">All units</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.unitNumber} · {u.shortName}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sh-status" className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Status</label>
              <select id="sh-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="field-input h-8 py-1 text-[12px]">
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label htmlFor="sh-type" className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Sync type</label>
              <select id="sh-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="field-input h-8 py-1 text-[12px]">
                <option value="">All</option>
                <option value="AUTOMATIC">Automatic</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>
            <div>
              <label htmlFor="sh-sort" className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Sort</label>
              <select id="sh-sort" value={sort} onChange={(e) => setSort(e.target.value as any)} className="field-input h-8 py-1 text-[12px]">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={resetFilters} className="h-8 text-[11.5px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">
                Reset filters
              </button>
            )}
          </div>

          {/* Table / states */}
          {loading && !hasLoadedOnce && <SkeletonRows />}

          {tableError && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-[12.5px] font-semibold text-[var(--gray)]">Unable to load synchronization history.</p>
              <button type="button" onClick={fetchLogs} className="btn btn-sm">
                <RefreshIcon className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          )}

          {!tableError && (!loading || hasLoadedOnce) && total === 0 && (
            <p className="py-8 text-center text-[12.5px] text-[var(--gray)]">No synchronization history available yet.</p>
          )}

          {!tableError && total > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-[11.5px]">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-left text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
                      <th scope="col" className="py-1.5 pr-3 font-extrabold">Date &amp; time</th>
                      <th scope="col" className="py-1.5 pr-3 font-extrabold">Unit</th>
                      <th scope="col" className="py-1.5 pr-3 font-extrabold">Type</th>
                      <th scope="col" className="py-1.5 pr-3 font-extrabold">Duration</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-extrabold">New</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-extrabold">Cancelled</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-extrabold" title="This app's Airbnb sync only imports/removes Airbnb bookings — it never creates or removes manual calendar blocks.">Manual blocks</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-extrabold" title="This app's Airbnb sync only imports/removes Airbnb bookings — it never creates or removes manual calendar blocks.">Removed blocks</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-extrabold">Updated</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-extrabold">Conflicts</th>
                      <th scope="col" className="py-1.5 pr-3 font-extrabold">Result</th>
                      <th scope="col" className="py-1.5 font-extrabold">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} className="border-b border-[var(--line)] text-[var(--gray)] last:border-0">
                        <td className="py-1.5 pr-3 whitespace-nowrap text-[var(--ink)]">{fmtDateTime(l.startedAt)}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{formatUnitDisplay(l.unit.unitNumber, l.unit.shortName)}</td>
                        <td className="py-1.5 pr-3">{l.syncType === "AUTOMATIC" ? "Automatic" : "Manual"}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDuration(l.durationMs)}</td>
                        <td className="py-1.5 pr-3 text-right">{l.imported}</td>
                        <td className="py-1.5 pr-3 text-right">{l.removed}</td>
                        <td className="py-1.5 pr-3 text-right text-[var(--gray)]">—</td>
                        <td className="py-1.5 pr-3 text-right text-[var(--gray)]">—</td>
                        <td className="py-1.5 pr-3 text-right">{l.updated}</td>
                        <td className="py-1.5 pr-3 text-right">{l.conflicts}</td>
                        <td className="py-1.5 pr-3">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-extrabold", l.ok ? "bg-green/15 text-green" : "bg-rausch/15 text-rausch")}>
                            {l.ok ? "Success" : "Failed"}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate py-1.5" title={l.error ?? undefined}>{l.error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11.5px] text-[var(--gray)]">
                <span>{total.toLocaleString()} record{total === 1 ? "" : "s"}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-sm disabled:opacity-40">
                    Prev
                  </button>
                  <span aria-live="polite">Page {page} of {totalPages}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn btn-sm disabled:opacity-40">
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 py-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-5 w-full animate-pulse rounded bg-[var(--bg-2)]" />
      ))}
    </div>
  );
}
