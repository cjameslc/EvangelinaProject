import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";

// PATCH body: { checked?: boolean[][], status?: "todo"|"cleaning"|"clean", byName?: string, start?: boolean, end?: boolean }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const data: any = {};
  if (body.checked) data.checked = body.checked;
  if (body.status) data.status = body.status;
  if (body.byName !== undefined) data.byName = body.byName;
  if (body.start) data.startedAt = new Date();
  if (body.end) data.endedAt = new Date();
  if (body.status === "todo") {
    data.startedAt = null;
    data.endedAt = null;
    data.byName = null;
  }

  const state = await prisma.housekeepingUnitState.upsert({
    where: { unitId: params.id },
    update: data,
    create: { unitId: params.id, checked: body.checked ?? [], status: body.status ?? "todo", byName: body.byName ?? null },
  });

  // When a clean finishes, write a permanent log entry.
  if (body.status === "clean" && body.end) {
    await prisma.cleaningLog.create({
      data: {
        unitId: params.id,
        startedAt: state.startedAt ?? new Date(),
        endedAt: state.endedAt ?? new Date(),
      },
    });
  }

  await logAudit(user.id, "housekeeping.update", "HousekeepingUnitState", params.id, { status: body.status });
  return NextResponse.json(state);
}
