"use client";

import { useEffect, useState } from "react";
import { useDeploymentStatus, type DeploymentEventDTO } from "@/lib/deployment-client";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { fmtDate, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<DeploymentEventDTO["status"], string> = {
  SCHEDULED: "Scheduled Maintenance",
  STARTING: "Deployment Starting",
  IN_PROGRESS: "Deployment in Progress",
  COMPLETED: "Deployment Successful",
  EMERGENCY: "Emergency Maintenance",
  RESTORED: "Service Restored",
  CANCELLED: "Cancelled",
};

// Info=blue, Warning=amber, Critical=rausch — the app's own existing
// palette tokens (globals.css :root), nothing new invented. EMERGENCY
// always reads as critical regardless of the event's own severity field,
// matching how the spec singles it out as inherently urgent.
function toneFor(event: DeploymentEventDTO): { bg: string; ring: string; dot: string } {
  if (event.status === "COMPLETED" || event.status === "RESTORED") return { bg: "bg-green/10", ring: "border-green/25", dot: "bg-green" };
  if (event.status === "EMERGENCY" || event.severity === "CRITICAL") return { bg: "bg-rausch/10", ring: "border-rausch/25", dot: "bg-rausch" };
  if (event.severity === "WARNING") return { bg: "bg-amber/10", ring: "border-amber/25", dot: "bg-amber" };
  return { bg: "bg-blue/10", ring: "border-blue/25", dot: "bg-blue" };
}

function useCountdown(target: string | null) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!target) { setLabel(null); return; }
    function tick() {
      const diffMs = new Date(target!).getTime() - Date.now();
      if (diffMs <= 0) { setLabel("00:00:00"); return; }
      const h = Math.floor(diffMs / 3_600_000);
      const m = Math.floor((diffMs % 3_600_000) / 60_000);
      const s = Math.floor((diffMs % 60_000) / 1000);
      setLabel([h, m, s].map((n) => String(n).padStart(2, "0")).join(":"));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return label;
}

function dismissKey(statusKey: string) {
  return `ev_deploy_dismissed:${statusKey}`;
}

export function DeploymentBanner() {
  const { event, statusKey, isNewStatus } = useDeploymentStatus();
  const toast = useToast();
  const countdown = useCountdown(event?.status === "SCHEDULED" ? event.startsAt : null);
  const [dismissed, setDismissed] = useState(false);
  const [criticalModalOpen, setCriticalModalOpen] = useState(false);

  // Re-derive dismissed/modal-seen state from localStorage whenever the
  // status actually changes (new event, or the same event's status moved
  // on) — this is what makes an informational notice "reappear if the
  // deployment status changes" without any server round trip.
  useEffect(() => {
    if (!statusKey) return;
    setDismissed(typeof window !== "undefined" && localStorage.getItem(dismissKey(statusKey)) === "1");
  }, [statusKey]);

  useEffect(() => {
    if (!event || !statusKey || !isNewStatus) return;
    toast(`${STATUS_LABEL[event.status]}: ${event.title}`);
    if (event.severity === "CRITICAL" || event.status === "EMERGENCY") {
      const seenKey = `ev_deploy_modal_seen:${statusKey}`;
      if (localStorage.getItem(seenKey) !== "1") setCriticalModalOpen(true);
    }
  }, [event, statusKey, isNewStatus, toast]);

  function dismiss() {
    if (!statusKey) return;
    localStorage.setItem(dismissKey(statusKey), "1");
    setDismissed(true);
  }
  function closeCriticalModal() {
    if (statusKey) localStorage.setItem(`ev_deploy_modal_seen:${statusKey}`, "1");
    setCriticalModalOpen(false);
  }

  if (!event) return null;

  const isCritical = event.severity === "CRITICAL" || event.status === "EMERGENCY";
  const dismissible = !isCritical;
  if (dismissible && dismissed) return null;

  const tone = toneFor(event);
  const scheduleLine = event.status === "SCHEDULED"
    ? `${fmtDate(event.startsAt)}, ${fmtTime(event.startsAt)}${event.endsAt ? ` – ${fmtTime(event.endsAt)}` : ""} (PHT)`
    : null;

  return (
    <>
      <div className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center", tone.bg, tone.ring)}>
        <span className={cn("h-2 w-2 flex-none rounded-full", tone.dot)} aria-hidden="true" />
        <span className="text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--ink)]">{STATUS_LABEL[event.status]}</span>
        <span className="text-[12.5px] text-[var(--ink)]">
          {event.title}
          {scheduleLine && <span className="opacity-80"> — {scheduleLine}</span>}
        </span>
        {countdown && (
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--ink)] dark:bg-white/10">
            begins in {countdown}
          </span>
        )}
        <span className="hidden text-[11.5px] text-[var(--gray)] sm:inline">{event.description}</span>
        {dismissible && (
          <button onClick={dismiss} className="ml-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold text-[var(--gray)] hover:bg-black/10 dark:hover:bg-white/10" aria-label="Dismiss">
            Dismiss
          </button>
        )}
      </div>

      <Modal
        open={criticalModalOpen}
        onClose={closeCriticalModal}
        title={STATUS_LABEL[event.status]}
        sub={event.title}
        footer={<button onClick={closeCriticalModal} className="btn-primary ml-auto">Got it</button>}
      >
        <p className="text-[13.5px] text-[var(--ink)]">{event.description}</p>
        {scheduleLine && <p className="mt-2 text-[12.5px] font-bold text-[var(--gray)]">{scheduleLine}</p>}
        {event.affectedModules.length > 0 && (
          <p className="mt-3 text-[12.5px] text-[var(--gray)]">Affected: {event.affectedModules.join(", ")}</p>
        )}
      </Modal>
    </>
  );
}
