import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { userSchema } from "@/lib/validation";
import { ensureEmployeeForUser } from "@/lib/employeeProvision";
import { isUniqueConstraintError } from "@/lib/apiValidation";

export async function GET() {
  const { user: actor, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  // Explicit select — excludes passwordHash. Includes avatarUrl so Users &
  // roles reflects each person's real photo; see the same select in
  // src/app/admin/page.tsx (this route just re-serves the same shape after
  // a save/archive/restore in that tab).
  const users = await prisma.user.findMany({
    where: { ownerId: actor.ownerId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, username: true, email: true, role: true, avatarColor: true, avatarUrl: true,
      active: true, mustChangePassword: true, createdAt: true, showOnGuestGuide: true,
      ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } },
    },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const body = userSchema.parse(await req.json());
  if (!body.password) return NextResponse.json({ error: "Password is required for new users." }, { status: 400 });

  const passwordHash = await bcrypt.hash(body.password, 10);
  try {
    const created = await prisma.user.create({
      data: {
        name: body.name,
        username: body.username.toLowerCase().trim(),
        passwordHash,
        role: body.role,
        mustChangePassword: true,
        showOnGuestGuide: body.showOnGuestGuide ?? false,
        ownerId: user.ownerId,
        ownedUnits: body.ownedUnitIds?.length
          ? { create: body.ownedUnitIds.map((unitId) => ({ unitId })) }
          : undefined,
      },
    });
    await ensureEmployeeForUser(created);
    await logAudit(user.id, "user.create", "User", created.id, { username: created.username, role: created.role });
    const { passwordHash: _omit, ...safe } = created;
    return NextResponse.json(safe, { status: 201 });
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    throw e;
  }
}
