"use client";

import { useEffect, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";

type OpsData = {
  live: { cleaning: { unitName: string; employeeName: string | null; startedAt: string }[]; waiting: { employeeName: string }[] };
  performance: { avgMinutes: number | null; fastestMinutes: number | null; longestMinutes: number | null; lateJobsToday: number; overdueCount: number; jobsToday: number; completedToday: number };
  access: { active: number; expiringSoon: number; expired: number; revoked: number };
  attendance: { loggedIn: number; working: number; loggedOut: number; autoLoggedOut: number };
  monthly: {
    assignedJobs: number; completedJobs: number; avgMinutes: number | null; fastestMinutes: number | null; longestMinutes: number | null;
    avgDelayMinutes: number | null; lateStarts: number; overdueCleanings: number; completionRatePct: number | null;
    codesGenerated: number; codesUsed: number; codesExpired: number; codesRevoked: number;
  };
};

function fmtMinutes(m: number | null): string {
  if (m === null) return "—";
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// Client-fetched (self-contained, same convention as MyAccessCode/
// GenerateHousekeepingCode) rather than server-prop-drilled through
// DashboardView's already-large data function — this is a genuinely
// separate concern (Housekeeping Workforce Management) layered on, not a
// figure the rest of the Dashboard's existing render pass depends on.
export function HousekeepingOperationsSection() {
  const [data, setData] = useState<OpsData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/housekeeping-ops").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  if (!data) return null;
  if (data.live.cleaning.length === 0 && data.live.waiting.length === 0 && data.performance.jobsToday === 0 && data.access.active === 0) return null;

  return (
    <Accordion title="Housekeeping Operations" sub={`${data.live.cleaning.length} cleaning now`}>
      <div className="space-y-2">
        {data.live.cleaning.map((c, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-teal/30 bg-teal/5 px-3.5 py-2.5">
            <div>
              <div className="text-[13.5px] font-extrabold">{c.employeeName ?? "Housekeeper"}</div>
              <div className="text-[12px] text-[var(--gray)]">Cleaning {c.unitName} · since {fmtTime(c.startedAt)}</div>
            </div>
            <span className="rounded-full bg-teal/15 px-2.5 py-1 text-[11px] font-bold text-teal">In progress</span>
          </div>
        ))}
        {data.live.waiting.map((w, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3.5 py-2.5">
            <div className="text-[13.5px] font-extrabold">{w.employeeName}</div>
            <span className="rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--gray)]">Waiting</span>
          </div>
        ))}
      </div>

      {/* The 4 numbers that answer "what needs attention today" — everything
          else (access codes, attendance, fastest/longest, delay) is real
          but secondary, tucked behind "Show details" below instead of
          competing with these for attention on every page load. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Cleaning now" value={String(data.live.cleaning.length)} />
        <StatCard label="Completed today" value={String(data.performance.completedToday)} />
        <StatCard label="Avg cleaning time" value={fmtMinutes(data.performance.avgMinutes)} sub="today" info="Average of today's actually-completed cleaning sessions (start to finish) only — never an unstarted job or a stale, never-checked-out one." />
        <StatCard label="Late / overdue" value={`${data.performance.lateJobsToday} / ${data.performance.overdueCount}`} warn={data.performance.overdueCount > 0} />
      </div>

      <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3.5">
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Monthly performance</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Monthly cleaning" value={`${data.monthly.assignedJobs} assigned · ${data.monthly.completedJobs} completed`} />
          <StatCard
            label="Completion rate" value={data.monthly.completionRatePct !== null ? `${data.monthly.completionRatePct}%` : "—"}
            warn={data.monthly.completionRatePct !== null && data.monthly.completionRatePct < 90} tone="caution"
            info="Completed cleaning jobs ÷ assigned cleaning jobs (checkouts) this month."
          />
          <StatCard label="Late / overdue" value={`${data.monthly.lateStarts} / ${data.monthly.overdueCleanings}`} sub="this month" />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="mt-3 flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--gray)] transition hover:text-[var(--ink)]"
      >
        {detailsOpen ? "Hide details" : "Show details"}
        <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")} />
      </button>

      {detailsOpen && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Active codes" value={String(data.access.active)} sub="temporary access" />
            <StatCard label="Expiring soon" value={String(data.access.expiringSoon)} sub="within 15 min" warn={data.access.expiringSoon > 0} tone="caution" />
            <StatCard label="Expired" value={String(data.access.expired)} />
            <StatCard label="Revoked" value={String(data.access.revoked)} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Fastest" value={fmtMinutes(data.performance.fastestMinutes)} sub="today" />
            <StatCard label="Longest" value={fmtMinutes(data.performance.longestMinutes)} sub="today" />
            <StatCard label="Logged in" value={String(data.attendance.loggedIn)} sub="today" />
            <StatCard label="Working" value={String(data.attendance.working)} sub="cleaning right now" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Logged out" value={String(data.attendance.loggedOut)} />
            <StatCard label="Auto logged out" value={String(data.attendance.autoLoggedOut)} sub="end of shift" />
            <StatCard label="Avg delay" value={data.monthly.avgDelayMinutes !== null ? `${data.monthly.avgDelayMinutes}m` : "—"} sub="this month" />
            <StatCard label="Fastest / longest" value={`${fmtMinutes(data.monthly.fastestMinutes)} / ${fmtMinutes(data.monthly.longestMinutes)}`} sub="this month" />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <StatCard label="Codes generated" value={String(data.monthly.codesGenerated)} sub={`${data.monthly.codesUsed} used · ${data.monthly.codesExpired} expired · ${data.monthly.codesRevoked} revoked`} />
          </div>
        </div>
      )}
    </Accordion>
  );
}
