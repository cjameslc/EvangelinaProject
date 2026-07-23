import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { userSchema } from "@/lib/validation";
import { ensureEmployeeForUser } from "@/lib/employeeProvision";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const body = userSchema.partial().parse(await req.json());
  const data: any = {
    ...(body.name && { name: body.name }),
    ...(body.username && { username: body.username.toLowerCase().trim() }),
    ...(body.role && { role: body.role }),
    ...(body.active !== undefined && { active: body.active }),
    ...(body.showOnGuestGuide !== undefined && { showOnGuestGuide: body.showOnGuestGuide }),
  };
  if (body.password) {
    data.passwordHash = await bcrypt.hash(body.password, 10);
    // An admin resetting someone's password forces them to pick a new one on next sign-in.
    data.mustChangePassword = true;
  }

  if (body.ownedUnitIds) {
    await prisma.unitOwner.deleteMany({ where: { userId: params.id } });
    if (body.ownedUnitIds.length) {
      await prisma.unitOwner.createMany({ data: body.ownedUnitIds.map((unitId) => ({ userId: params.id, unitId })) });
    }
  }

  try {
    const updated = await prisma.user.update({ where: { id: params.id }, data });
    await ensureEmployeeForUser(updated);
    await logAudit(user.id, "user.update", "User", params.id, { role: body.role });
    const { passwordHash, ...safe } = updated;
    return NextResponse.json(safe);
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  await prisma.user.update({ where: { id: params.id }, data: { active: false } });
  await logAudit(user.id, "user.deactivate", "User", params.id);
  return NextResponse.json({ ok: true });
}
