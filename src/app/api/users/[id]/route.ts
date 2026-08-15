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
  // Was missing entirely — the most severe gap in this audit: with no
  // check here, any OWNER_ADMIN could PATCH any other tenant's User by id,
  // including setting a new password (full account takeover) or changing
  // their role. Found while sweeping every by-ID route after the same
  // pattern turned up on Units.
  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { name: true, username: true, role: true, active: true, ownerId: true } });
  if (!target || target.ownerId !== user.ownerId) return NextResponse.json({ error: "User not found." }, { status: 404 });

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
    // Never includes password/passwordHash in the audit trail itself — just
    // whether one was changed. Role changes especially matter here
    // (privilege escalation risk), which the old {role: body.role}-only
    // shape couldn't show what it changed *from*.
    const { password: _password, ...bodyWithoutPassword } = body;
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(bodyWithoutPassword)) if (k in target) before[k] = (target as any)[k];
    await logAudit(user.id, "user.update", "User", params.id, {
      before,
      after: bodyWithoutPassword,
      ...(body.password ? { passwordChanged: true } : {}),
    });
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
  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!target || target.ownerId !== user.ownerId) return NextResponse.json({ error: "User not found." }, { status: 404 });
  await prisma.user.update({ where: { id: params.id }, data: { active: false } });
  // Same reasoning as the PATCH path above — keep the linked Employee (and
  // therefore My Earnings/payroll) in sync with the account being archived.
  await prisma.employee.updateMany({ where: { userId: params.id }, data: { active: false } });
  await logAudit(user.id, "user.deactivate", "User", params.id);
  return NextResponse.json({ ok: true });
}
