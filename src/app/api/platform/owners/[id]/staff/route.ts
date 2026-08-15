import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/ownerScope";
import { logAudit } from "@/lib/session";
import { ensureEmployeeForUser } from "@/lib/employeeProvision";
import { userSchema } from "@/lib/validation";
import { parseOrError, isUniqueConstraintError } from "@/lib/apiValidation";

/**
 * Platform Admin adding a real staff account to an EXISTING owner (as
 * opposed to POST /api/platform/owners, which creates a brand new tenant
 * plus its first login) — "add my employee to another staycation": a
 * person who already works at one tenant getting their own separate
 * account at a different one. There is no shared-identity concept
 * anywhere in this schema (a User row belongs to exactly one ownerId, same
 * as everywhere else in the app), so this deliberately creates a genuinely
 * new, independent account — sourceUserId is only ever used to attribute
 * the audit log entry to "who this was modeled after," never linked at
 * the data level.
 *
 * Same userSchema regular staff creation (POST /api/users) already
 * validates against — the only difference is the target owner comes from
 * the platform admin's own choice of tenant (any owner), not the caller's
 * own ownerId.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const owner = await prisma.owner.findUnique({ where: { id: params.id }, select: { id: true, businessName: true } });
  if (!owner) return NextResponse.json({ error: "Owner not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseOrError(userSchema, body);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;
  if (!data.password) return NextResponse.json({ error: "Password is required for new users." }, { status: 400 });

  const sourceUserId = typeof body.sourceUserId === "string" ? body.sourceUserId : null;

  const passwordHash = await bcrypt.hash(data.password, 10);
  try {
    const created = await prisma.user.create({
      data: {
        name: data.name,
        username: data.username.toLowerCase().trim(),
        passwordHash,
        role: data.role,
        mustChangePassword: true,
        showOnGuestGuide: data.showOnGuestGuide ?? false,
        ownerId: owner.id,
      },
    });
    await ensureEmployeeForUser(created);
    await logAudit(user.id, "platform.staff.create", "User", created.id, {
      username: created.username, role: created.role, ownerId: owner.id, ownerBusinessName: owner.businessName, sourceUserId,
    });
    const { passwordHash: _omit, ...safe } = created;
    return NextResponse.json({ user: safe, login: { username: created.username, tempPassword: data.password } }, { status: 201 });
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    throw e;
  }
}
