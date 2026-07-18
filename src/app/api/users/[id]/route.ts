import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { userSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const body = userSchema.partial().parse(await req.json());
  const data: any = {
    ...(body.name && { name: body.name }),
    ...(body.email && { email: body.email.toLowerCase().trim() }),
    ...(body.role && { role: body.role }),
    ...(body.active !== undefined && { active: body.active }),
  };
  if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);

  if (body.ownedUnitIds) {
    await prisma.unitOwner.deleteMany({ where: { userId: params.id } });
    if (body.ownedUnitIds.length) {
      await prisma.unitOwner.createMany({ data: body.ownedUnitIds.map((unitId) => ({ userId: params.id, unitId })) });
    }
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  await logAudit(user.id, "user.update", "User", params.id, { role: body.role });
  const { passwordHash, ...safe } = updated;
  return NextResponse.json(safe);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  await prisma.user.update({ where: { id: params.id }, data: { active: false } });
  await logAudit(user.id, "user.deactivate", "User", params.id);
  return NextResponse.json({ ok: true });
}
