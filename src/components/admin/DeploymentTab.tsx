"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtDate, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type DeploymentEvent = {
  id: string;
  title: string;
  description: string;
  status: "SCHEDULED" | "STARTING" | "IN_PROGRESS" | "COMPLETED" | "EMERGENCY" | "RESTORED" | "CANCELLED";
  severity: "INFO" | "WARNING" | "CRITICAL";
  startsAt: string;
  endsAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  affectedModules: string[];
  releaseNotes: string | null;
  fullMaintenanceMode: boolean;
  notifyEmail: boolean;
  outcome: string | null;
  rolledBack: boolean;
  createdBy: { name: string } | null;
  createdAt: string;
};

const STATUS_LABEL: Record<DeploymentEvent["status"], string> = {
  SCHEDULED: "Scheduled",
  STARTING: "Starting",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  EMERGENCY: "Emergency",
  RESTORED: "Restored",
  CANCELLED: "Cancelled",
};
const STATUS_CLASSES: Record<DeploymentEvent["status"], string> = {
  SCHEDULED: "bg-blue/10 text-blue",
  STARTING: "bg-amber/10 text-amber",
  IN_PROGRESS: "bg-amber/10 text-amber",
  COMPLETED: "bg-green/10 text-green",
  EMERGENCY: "bg-rausch/10 text-rausch",
  RESTORED: "bg-green/10 text-green",
  CANCELLED: "bg-[var(--bg-2)] text-[var(--gray)]",
};

const emptyForm = {
  title: "", description: "", status: "SCHEDULED" as "SCHEDULED" | "EMERGENCY", severity: "INFO" as "INFO" | "WARNING" | "CRITICAL",
  startsAt: "", endsAt: "", affectedModules: "", releaseNotes: "", fullMaintenanceMode: false, notifyEmail: false,
};

// "YYYY-MM-DDTHH:mm" in the browser's local time — the exact format
// <input type="datetime-local"> needs for its value.
function nowForDateTimeLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function StatusPill({ status }: { status: DeploymentEvent["status"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold", STATUS_CLASSES[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DeploymentTab() {
  const toast = useToast();
  const [active, setActive] = useState<DeploymentEvent | null>(null);
  const [history, setHistory] = useState<DeploymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function refresh() {
    const [statusRes, historyRes] = await Promise.all([
      fetch("/api/deployment/status"),
      fetch("/api/admin/deployment/history"),
    ]);
    if (statusRes.ok) setActive(await statusRes.json());
    if (historyRes.ok) setHistory(await historyRes.json());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // Same visibility gating as deployment-client.ts's poll — this tab is
    // admin-only and rarely left open, but there's no reason to keep
    // polling once it's not actually on screen.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20_000);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  async function createEvent() {
    if (!form.title.trim() || !form.description.trim() || !form.startsAt) {
      toast("Title, description, and start date/time are required.", true);
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/deployment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        severity: form.severity,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        affectedModules: form.affectedModules.split(",").map((s) => s.trim()).filter(Boolean),
        releaseNotes: form.releaseNotes.trim() || null,
        fullMaintenanceMode: form.fullMaintenanceMode,
        notifyEmail: form.notifyEmail,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) { toast(data.error ?? "Couldn't create deployment event.", true); return; }
    setForm(emptyForm);
    toast("Deployment event created.");
    refresh();
  }

  async function runAction(id: string, action: string, outcome?: "SUCCESS" | "FAILED") {
    setBusyAction(action);
    const res = await fetch(`/api/admin/deployment/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, outcome }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyAction(null);
    if (!res.ok) { toast(data.error ?? "Action failed.", true); return; }
    toast("Updated.");
    refresh();
  }

  async function deleteScheduled(id: string) {
    if (!confirm("Delete this scheduled event? This can't be undone.")) return;
    const res = await fetch(`/api/admin/deployment/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error ?? "Couldn't delete.", true); return; }
    toast("Deleted.");
    refresh();
  }

  if (loading) return <p className="text-[13.5px] text-[var(--gray)]">Loading…</p>;

  return (
    <div className="space-y-5">
      {active ? (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <StatusPill status={active.status} />
                {active.fullMaintenanceMode && <span className="text-[11px] font-bold text-rausch">Full maintenance mode</span>}
              </div>
              <h3 className="text-[17px] font-extrabold">{active.title}</h3>
              <p className="mt-1 max-w-xl text-[13.5px] text-[var(--gray)]">{active.description}</p>
              <p className="mt-2 text-[12px] text-[var(--gray)]">
                Starts {fmtDate(active.startsAt)}, {fmtTime(active.startsAt)}
                {active.endsAt && ` – ${fmtTime(active.endsAt)}`}
                {active.createdBy && ` · Created by ${active.createdBy.name}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(active.status === "SCHEDULED" || active.status === "STARTING") && (
                <button onClick={() => runAction(active.id, "start")} disabled={!!busyAction} className="btn btn-sm">
                  {busyAction === "start" ? "Starting…" : "Start Now"}
                </button>
              )}
              {active.status !== "EMERGENCY" && (
                <button onClick={() => runAction(active.id, "complete", "SUCCESS")} disabled={!!busyAction} className="btn-primary btn-sm">
                  {busyAction === "complete" ? "Completing…" : "Mark Completed"}
                </button>
              )}
              {active.status === "EMERGENCY" && (
                <button onClick={() => runAction(active.id, "restore")} disabled={!!busyAction} className="btn-primary btn-sm">
                  {busyAction === "restore" ? "Restoring…" : "Mark Restored"}
                </button>
              )}
              <button onClick={() => runAction(active.id, "rollback")} disabled={!!busyAction} className="btn btn-sm text-rausch">
                {busyAction === "rollback" ? "Rolling back…" : "Rollback"}
              </button>
              <button onClick={() => runAction(active.id, "cancel")} disabled={!!busyAction} className="btn btn-sm">
                {busyAction === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">New deployment notice</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="field-label">Title</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="field-input mt-1" placeholder="e.g. New calendar features" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="field-input mt-1" rows={2} placeholder="What staff should expect" />
            </div>
            <div>
              <label className="field-label">Kind</label>
              <select
                value={form.status}
                onChange={(e) => {
                  const status = e.target.value as typeof form.status;
                  // An emergency is happening right now by definition — pre-fill
                  // "Starts" instead of leaving an admin who's mid-incident to
                  // manually go find the current time in a date picker.
                  setForm((f) => ({ ...f, status, startsAt: status === "EMERGENCY" && !f.startsAt ? nowForDateTimeLocal() : f.startsAt }));
                }}
                className="field-input mt-1"
              >
                <option value="SCHEDULED">Scheduled deployment</option>
                <option value="EMERGENCY">Emergency maintenance (starts now)</option>
              </select>
            </div>
            <div>
              <label className="field-label">Severity</label>
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as typeof f.severity }))} className="field-input mt-1">
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="field-label">Starts</label>
              <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="field-input mt-1" />
            </div>
            <div>
              <label className="field-label">Ends (optional)</label>
              <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="field-input mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Affected modules (comma-separated, optional)</label>
              <input value={form.affectedModules} onChange={(e) => setForm((f) => ({ ...f, affectedModules: e.target.value }))} className="field-input mt-1" placeholder="Bookings, Calendar" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Release notes (optional)</label>
              <textarea value={form.releaseNotes} onChange={(e) => setForm((f) => ({ ...f, releaseNotes: e.target.value }))} className="field-input mt-1" rows={2} />
            </div>
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <input type="checkbox" checked={form.fullMaintenanceMode} onChange={(e) => setForm((f) => ({ ...f, fullMaintenanceMode: e.target.checked }))} />
              Full maintenance mode (blocks staff access except Owner/Admin)
            </label>
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <input type="checkbox" checked={form.notifyEmail} onChange={(e) => setForm((f) => ({ ...f, notifyEmail: e.target.checked }))} />
              Email Owner/Admin &amp; Co-owner accounts
            </label>
          </div>
          <button onClick={createEvent} disabled={creating} className="btn-primary btn-sm mt-4">
            {creating ? "Creating…" : "Create deployment notice"}
          </button>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-[15px] font-extrabold">History</h3>
        {history.length === 0 ? (
          <EmptyState title="No deployment events yet" sub="Created, started, and completed deployments will show up here." />
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-[var(--line)]">
              {history.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <StatusPill status={h.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold">{h.title}</div>
                    <div className="truncate text-[12px] text-[var(--gray)]">
                      {h.createdBy?.name ?? "System"} · {fmtDate(h.createdAt)}
                      {h.outcome && ` · ${h.outcome === "SUCCESS" ? "Success" : "Failed"}`}
                      {h.rolledBack && " · Rolled back"}
                    </div>
                  </div>
                  {h.status === "SCHEDULED" && (
                    <button onClick={() => deleteScheduled(h.id)} className="text-[12px] font-bold text-rausch hover:underline">Delete</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
