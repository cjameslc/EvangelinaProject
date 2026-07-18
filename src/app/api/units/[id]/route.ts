import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { unitSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const { ownerUserIds, ...body } = unitSchema.partial().parse(await req.json());
  const unit = await prisma.unit.update({ where: { id: params.id }, data: body });
  if (ownerUserIds !== undefined) {
    // Replace the unit's owner set wholesale — simpler and safer than diffing,
    // and this list is short enough that it's never a performance concern.
    await prisma.unitOwner.deleteMany({ where: { unitId: unit.id } });
    if (ownerUserIds.length) {
      await prisma.unitOwner.createMany({ data: ownerUserIds.map((userId) => ({ userId, unitId: unit.id })) });
    }
  }
  await logAudit(user.id, "unit.update", "Unit", unit.id, { ...body, ownerUserIds });
  return NextResponse.json(unit);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  await prisma.unit.delete({ where: { id: params.id } });
  await logAudit(user.id, "unit.delete", "Unit", params.id);
  return NextResponse.json({ ok: true });
}
