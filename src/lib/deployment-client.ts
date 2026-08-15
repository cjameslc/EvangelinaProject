"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export type DeploymentEventDTO = {
  id: string;
  title: string;
  description: string;
  status: "SCHEDULED" | "STARTING" | "IN_PROGRESS" | "COMPLETED" | "EMERGENCY" | "RESTORED" | "CANCELLED";
  severity: "INFO" | "WARNING" | "CRITICAL";
  startsAt: string;
  endsAt: string | null;
  affectedModules: string[];
  releaseNotes: string | null;
  fullMaintenanceMode: boolean;
  createdBy: { name: string } | null;
};

// This codebase has no WebSocket/SSE infrastructure anywhere — the one
// existing "real-time" precedent (src/components/analytics/AutoRefresh.tsx)
// is a plain setInterval poll, so this matches that instead of introducing
// a first push-transport for a single feature.
//
// 60s (not the original 20s) — this component is mounted app-wide in the
// root layout, not scoped to one page, so it polls for every staff member
// who has any tab open, on every page, all day. Real production traffic
// sampling found this single endpoint accounting for the large majority of
// all requests to the app, almost entirely wasted (there's essentially
// never an active deployment event to report). A deployment/maintenance
// banner is informational, not time-critical — being up to ~70s behind
// (60s interval + the server-side 10s cache in getCachedActiveDeploymentEvent)
// is an imperceptible tradeoff against that. See also the visibility gating
// below, which stops the poll entirely while the tab isn't in the
// foreground (the same staff members leaving a tab open in the background
// was the other half of the real waste, not just the interval length).
const POLL_MS = 60_000;

export function useDeploymentStatus() {
  // This whole feature is staff-app only (the guest booking site is a
  // separate, revenue-critical surface this feature deliberately doesn't
  // touch) — but DeploymentBanner is mounted in the root layout, which IS
  // shared with guest pages. Gating the poll on an authenticated staff
  // session, not just where the component happens to be mounted, is what
  // actually keeps this off the guest site instead of just visually hidden.
  const { status: sessionStatus } = useSession();
  const [event, setEvent] = useState<DeploymentEventDTO | null>(null);
  const [loaded, setLoaded] = useState(false);
  const prevStatusKey = useRef<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    async function poll() {
      // Skip while the tab is in the background — a banner nobody is
      // looking at doesn't need to stay fresh, and background tabs are
      // exactly the case that turned this into the majority of the app's
      // total request volume (see POLL_MS's comment above).
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/deployment/status");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as DeploymentEventDTO | null;
        if (!cancelled) setEvent(data);
      } catch {
        // A missed poll just tries again in POLL_MS — never surface this.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    // Catches up immediately on return to the tab instead of waiting up to
    // POLL_MS after regaining focus, so switching back doesn't feel stale.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sessionStatus]);

  // `${id}:${status}` — a genuinely new status (including a brand new event
  // entirely) is a new key here, which is what both the toast-once logic and
  // the banner's dismiss-persistence below key off of.
  const statusKey = event ? `${event.id}:${event.status}` : null;
  const isNewStatus = loaded && statusKey !== null && prevStatusKey.current !== null && prevStatusKey.current !== statusKey;
  useEffect(() => {
    if (loaded) prevStatusKey.current = statusKey;
  }, [loaded, statusKey]);

  return { event, statusKey, isNewStatus, loaded };
}
