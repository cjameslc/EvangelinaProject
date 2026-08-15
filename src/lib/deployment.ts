import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export type DeploymentStatus = "SCHEDULED" | "STARTING" | "IN_PROGRESS" | "COMPLETED" | "EMERGENCY" | "RESTORED" | "CANCELLED";

const TERMINAL_STATUSES = ["COMPLETED", "RESTORED", "CANCELLED"];

const DEPLOYMENT_INCLUDE = { createdBy: { select: { name: true } } } as const;

/**
 * Persists a status change and writes the matching audit entry in one call —
 * used both by the lazy auto-transition below (actorUserId: null, "System"
 * in the audit trail, same convention as the housekeeping auto-credential
 * flow's access.credential.failed entries) and by the admin lifecycle
 * actions (Start Now / Mark Completed / Cancel / …) in the PUT route.
 */
export async function setDeploymentStatus(
  id: string,
  data: { status: DeploymentStatus; startedAt?: Date; completedAt?: Date; cancelledAt?: Date; outcome?: string; rolledBack?: boolean },
  actorUserId: string | null,
  action: string
) {
  const updated = await prisma.deploymentEvent.update({ where: { id }, data, include: DEPLOYMENT_INCLUDE });
  await logAudit(actorUserId, action, "DeploymentEvent", id, { status: data.status });
  return updated;
}

/**
 * The one place that decides "what's the effective current deployment
 * status right now" — auto-flips a SCHEDULED event to IN_PROGRESS once its
 * start time has passed, and flips an unfinished event to COMPLETED once
 * its end time has passed. This app has no cron precise enough for a
 * "starts at 10:00 PM sharp" banner (vercel.json's only cron runs once a
 * day), so the transition happens lazily on read instead — see
 * getCachedActiveDeploymentEvent below for how often that read actually
 * happens now.
 */
export async function getActiveDeploymentEvent() {
  const event = await prisma.deploymentEvent.findFirst({
    where: { enabled: true, status: { notIn: TERMINAL_STATUSES } },
    orderBy: { createdAt: "desc" },
    include: DEPLOYMENT_INCLUDE,
  });
  if (!event) return null;

  const now = new Date();
  if (event.status === "SCHEDULED" && now >= event.startsAt) {
    return setDeploymentStatus(event.id, { status: "IN_PROGRESS", startedAt: now }, null, "deployment.auto_started");
  }
  // EMERGENCY events are hand-declared incidents, not scheduled work — an
  // endsAt on one (if set at all) is an estimate, not a hard end time, so
  // it never auto-completes; only an explicit "Mark Restored" action does.
  if (event.endsAt && now >= event.endsAt && event.status !== "EMERGENCY") {
    return setDeploymentStatus(event.id, { status: "COMPLETED", completedAt: now, outcome: "SUCCESS" }, null, "deployment.auto_completed");
  }
  return event;
}

/**
 * Cached wrapper around getActiveDeploymentEvent — every staff session has
 * DeploymentBanner mounted app-wide (root layout), polling this on an
 * interval regardless of which page they're on. Live traffic sampling
 * found this endpoint alone accounting for ~60% of all requests to the
 * app (a handful of staff leaving a tab open all day, each polling
 * independently, adds up fast) even though the common case — no active
 * deployment event — never changes between polls. unstable_cache means
 * concurrent pollers across every open session share one real DB read
 * (and, when a transition is actually due, one real write) per window
 * instead of one each; see getCachedMaintenanceFlag just below for the
 * exact same pattern already established for the other deployment-status
 * read. 10s (not the 60s the poll interval was raised to) keeps a
 * transition landing within about one poll cycle either way; JSON round-
 * trip because unstable_cache-returned values must be plain-JSON safe
 * (Date fields don't survive as Date instances otherwise).
 */
export const getCachedActiveDeploymentEvent = unstable_cache(
  async () => {
    const event = await getActiveDeploymentEvent();
    return event ? (JSON.parse(JSON.stringify(event)) as typeof event) : null;
  },
  ["deployment-active-event"],
  { revalidate: 10 }
);

/**
 * A single non-sensitive boolean (no title/description leaked) for
 * src/middleware.ts to check on every staff-route request. Edge middleware
 * can't hold a live Prisma connection, so this is fetched over HTTP instead
 * (see /api/deployment/maintenance-flag) — unstable_cache here plus the
 * fetch's own `next: { revalidate }` on the middleware side means the
 * actual DB hit happens at most once per window, not once per request.
 * Deliberately doesn't run the lazy auto-transition getActiveDeploymentEvent
 * does — that's a write, and this path needs to stay cheap and read-only
 * since it runs in front of literally every staff page load.
 */
export const getCachedMaintenanceFlag = unstable_cache(
  async (): Promise<boolean> => {
    const event = await prisma.deploymentEvent.findFirst({
      where: { enabled: true, fullMaintenanceMode: true, status: { notIn: TERMINAL_STATUSES } },
      select: { id: true },
    });
    return !!event;
  },
  ["deployment-maintenance-flag"],
  { revalidate: 15 }
);
