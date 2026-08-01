import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { userSchema } from "@/lib/validation";
import { ensureEmployeeForUser } from "@/lib/employeeProvision";
import { isUniqueConstraintError } from "@/lib/apiValidation";

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
    // Archiving/restoring a user is the only place staff accounts are
    // (de)activated, but payroll reads from the linked Employee row, not
    // the User — without this, an archived user keeps showing up (with pay)
    // in My Earnings since their Employee record was never touched.
    if (body.active !== undefined) {
      await prisma.employee.updateMany({ where: { userId: params.id }, data: { active: body.active } });
    }
    await logAudit(user.id, "user.update", "User", params.id, { role: body.role });
    const { passwordHash, ...safe } = updated;
    return NextResponse.json(safe);
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  await prisma.user.update({ where: { id: params.id }, data: { active: false } });
  // Same reasoning as the PATCH path above — keep the linked Employee (and
  // therefore My Earnings/payroll) in sync with the account being archived.
  await prisma.employee.updateMany({ where: { userId: params.id }, data: { active: false } });
  await logAudit(user.id, "user.deactivate", "User", params.id);
  return NextResponse.json({ ok: true });
}
