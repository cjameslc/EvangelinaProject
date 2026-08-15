"use client";

import { useEffect, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { canViewAccessHistory } from "@/lib/rbac";
import { fmtDate, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type SecurityEvent = {
  id: string; unitLabel: string | null; occurredAt: string; classification: string; severity: string; reason: string;
  passcodeMasked: string | null; ttlockUsername: string | null; dismissedAt: string | null;
};

const SEVERITY_DOT: Record<string, string> = { CRITICAL: "bg-rausch", HIGH: "bg-rausch", MEDIUM: "bg-amber", LOW: "bg-[var(--gray)]", NONE: "bg-teal" };
const SEVERITY_LABEL: Record<string, string> = { CRITICAL: "🔴 Critical", HIGH: "🟠 High", MEDIUM: "🟡 Medium", LOW: "⚪ Low", NONE: "🟢 OK" };

/**
 * "TTLock accepted the code" and "our application authorized this
 * access" are two different questions — this section shows the answer to
 * the second one, computed by src/lib/access/eventSync.ts's classifier,
 * never assumed from the lock alone. Self-fetching (role-gated client
 * component, same "fetch on demand" pattern as LaundryPanel/
 * PlaceInsightsPanel) rather than threaded through Dashboard's own
 * server-side props, so this stays additive and doesn't touch the
 * existing data-fetching path other Dashboard sections rely on.
 */
export function SecurityMonitorSection({ role }: { role: string }) {
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; critical: number; high: number; medium: number } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const res = await fetch("/api/access/security-events");
    if (!res.ok) return;
    const j = await res.json();
    setEvents(j.events);
    setSummary(j.summary);
  }
  useEffect(() => { if (canViewAccessHistory(role as any)) load(); }, [role]);

  async function checkNow() {
    setSyncing(true);
    try {
      await fetch("/api/access/security-events/sync", { method: "POST" });
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function dismiss(id: string) {
    setEvents((prev) => prev && prev.filter((e) => e.id !== id));
    await fetch(`/api/access/security-events/${id}/dismiss`, { method: "POST" });
  }

  if (!canViewAccessHistory(role as any)) return null;
  if (!events || !summary) return <div className="stat-card h-24 animate-pulse" />;

  const clean = summary.critical === 0 && summary.high === 0;

  return (
    <Accordion
      title="Security Monitor"
      sub={clean ? "No unauthorized access detected" : `${summary.critical + summary.high} event${summary.critical + summary.high === 1 ? "" : "s"} need attention`}
    >
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Critical" value={String(summary.critical)} warn={summary.critical > 0} tone="danger" />
        <StatCard label="High" value={String(summary.high)} warn={summary.high > 0} tone="caution" />
        <StatCard label="Medium" value={String(summary.medium)} />
        <StatCard label="Open events" value={String(summary.total)} />
      </div>

      {role === "OWNER_ADMIN" && (
        <button onClick={checkNow} disabled={syncing} className="btn btn-sm mb-3">
          {syncing ? "Checking…" : "Check now"}
        </button>
      )}

      {events.length === 0 ? (
        <p className="text-[13px] text-[var(--gray)]">No open security events. TTLock access history is checked automatically once a day, plus on demand above.</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 10).map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-start gap-2.5">
                <span className={cn("mt-1 h-2 w-2 flex-none rounded-full", SEVERITY_DOT[e.severity])} />
                <div>
                  <div className="text-[13px] font-bold text-[var(--ink)]">
                    {SEVERITY_LABEL[e.severity]} · {e.classification.replace(/_/g, " ")} · {e.unitLabel ?? "Unknown unit"}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--gray)]">{e.reason}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--gray)]">
                    {fmtDate(e.occurredAt, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} · {fmtTime(e.occurredAt)}
                    {e.passcodeMasked && ` · code ${e.passcodeMasked}`}
                    {e.ttlockUsername && ` · "${e.ttlockUsername}"`}
                  </div>
                </div>
              </div>
              {(role === "OWNER_ADMIN" || role === "CO_OWNER") && (
                <button onClick={() => dismiss(e.id)} className="flex-none text-[11.5px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Dismiss</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Accordion>
  );
}
