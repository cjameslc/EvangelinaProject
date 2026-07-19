import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { userSchema } from "@/lib/validation";

export async function GET() {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } } },
  });
  return NextResponse.json(users.map(({ passwordHash, ...u }) => u));
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
        ownedUnits: body.ownedUnitIds?.length
          ? { create: body.ownedUnitIds.map((unitId) => ({ unitId })) }
          : undefined,
      },
    });
    await logAudit(user.id, "user.create", "User", created.id, { username: created.username, role: created.role });
    const { passwordHash: _omit, ...safe } = created;
    return NextResponse.json(safe, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    throw e;
  }
}
