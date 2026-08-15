import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/session";
import { requirePlatformAdmin } from "@/lib/ownerScope";
import { deploymentEventCreateSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";
import { sendDeploymentNotice } from "@/lib/deploymentEmail";

const TERMINAL_STATUSES = ["COMPLETED", "RESTORED", "CANCELLED"];

// Platform-admin only, not just any tenant's OWNER_ADMIN — DeploymentEvent
// has no ownerId at all (it's a real single global concept: "only one
// active event at a time" is enforced app-wide below), and
// fullMaintenanceMode locks out every other tenant's staff platform-wide.
// Previously any tenant's Owner/Admin could trigger this — a cross-tenant
// availability/DoS gap, not a data leak, but a real one now that a second
// tenant exists.
export async function POST(req: NextRequest) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const parsed = parseOrError(deploymentEventCreateSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Only one active event at a time — enforced here, not in the schema.
  const existing = await prisma.deploymentEvent.findFirst({ where: { status: { notIn: TERMINAL_STATUSES } } });
  if (existing) {
    return NextResponse.json(
      { error: `"${existing.title}" is already active (${existing.status}). Complete or cancel it before starting a new one.` },
      { status: 409 }
    );
  }

  const event = await prisma.deploymentEvent.create({
    data: {
      title: body.title,
      description: body.description,
      status: body.status ?? "SCHEDULED",
      severity: body.severity ?? "INFO",
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      affectedModules: body.affectedModules ? JSON.stringify(body.affectedModules) : null,
      releaseNotes: body.releaseNotes ?? null,
      fullMaintenanceMode: body.fullMaintenanceMode ?? false,
      notifyEmail: body.notifyEmail ?? false,
      createdByUserId: user.id,
      // An EMERGENCY event is happening right now by definition — it starts
      // in that state, not "scheduled" for a future time.
      startedAt: body.status === "EMERGENCY" ? new Date() : null,
    },
    include: { createdBy: { select: { name: true } } },
  });

  await logAudit(user.id, "deployment.created", "DeploymentEvent", event.id, { title: event.title, status: event.status });

  if (event.notifyEmail) {
    // Off by default per event — a deliberate admin opt-in, not every
    // deployment. Never lets an email failure affect the 201 response.
    try {
      const recipients = await prisma.user.findMany({
        where: { active: true, role: { in: ["OWNER_ADMIN", "CO_OWNER"] }, email: { not: null } },
        select: { email: true },
      });
      await sendDeploymentNotice(recipients.map((r) => r.email!).filter(Boolean), {
        title: event.title,
        description: event.description,
        status: event.status,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt ? event.endsAt.toISOString() : null,
        releaseNotes: event.releaseNotes,
      });
    } catch {
      // best-effort — the event itself was already created successfully
    }
  }

  return NextResponse.json(event, { status: 201 });
}
