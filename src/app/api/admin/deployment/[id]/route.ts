import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/session";
import { requirePlatformAdmin } from "@/lib/ownerScope";
import { deploymentEventActionSchema, deploymentEventUpdateSchema } from "@/lib/validation";
import { setDeploymentStatus, type DeploymentStatus } from "@/lib/deployment";

// Lifecycle buttons in the admin UI all call this one action shape —
// mirrors how POST /api/bookings/[id]/confirmation already overloads
// action-vs-update in this codebase, rather than a separate route per verb.
function actionToTransition(action: string, outcome?: string): { status: DeploymentStatus; data: Record<string, unknown> } {
  const now = new Date();
  switch (action) {
    case "start":
      return { status: "IN_PROGRESS", data: { startedAt: now } };
    case "complete":
      return { status: "COMPLETED", data: { completedAt: now, outcome: outcome ?? "SUCCESS" } };
    case "cancel":
      return { status: "CANCELLED", data: { cancelledAt: now } };
    case "restore":
      return { status: "RESTORED", data: { completedAt: now, outcome: outcome ?? "SUCCESS" } };
    case "rollback":
      // A rollback means the deploy didn't stick — always resolves as a
      // failed outcome, regardless of what the caller passed.
      return { status: "COMPLETED", data: { completedAt: now, outcome: "FAILED", rolledBack: true } };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));

  const actionParsed = deploymentEventActionSchema.safeParse(body);
  if (actionParsed.success) {
    const { action, outcome } = actionParsed.data;
    const { status, data } = actionToTransition(action, outcome);
    try {
      const updated = await setDeploymentStatus(params.id, { status, ...data } as any, user.id, `deployment.${action}`);
      return NextResponse.json(updated);
    } catch {
      return NextResponse.json({ error: "Deployment event not found." }, { status: 404 });
    }
  }

  const updateParsed = deploymentEventUpdateSchema.safeParse(body);
  if (!updateParsed.success) {
    return NextResponse.json({ error: updateParsed.error.errors[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const patch = updateParsed.data;
  const data: Record<string, unknown> = { ...patch };
  if ("startsAt" in patch && patch.startsAt) data.startsAt = new Date(patch.startsAt);
  if ("endsAt" in patch) data.endsAt = patch.endsAt ? new Date(patch.endsAt) : null;
  if ("affectedModules" in patch) data.affectedModules = patch.affectedModules ? JSON.stringify(patch.affectedModules) : null;

  const updated = await prisma.deploymentEvent.update({
    where: { id: params.id },
    data,
    include: { createdBy: { select: { name: true } } },
  }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Deployment event not found." }, { status: 404 });

  await logAudit(user.id, "deployment.updated", "DeploymentEvent", params.id, patch);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const event = await prisma.deploymentEvent.findUnique({ where: { id: params.id } });
  if (!event) return NextResponse.json({ error: "Deployment event not found." }, { status: 404 });
  // Never delete the record of something that actually ran — only a
  // not-yet-started SCHEDULED event (created by mistake, wrong date, etc.)
  // is deletable. Everything else is cancelled instead, keeping history intact.
  if (event.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Only a not-yet-started Scheduled event can be deleted — cancel it instead." }, { status: 409 });
  }

  await prisma.deploymentEvent.delete({ where: { id: params.id } });
  await logAudit(user.id, "deployment.deleted", "DeploymentEvent", params.id, { title: event.title });
  return NextResponse.json({ ok: true });
}
