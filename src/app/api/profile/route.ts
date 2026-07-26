import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { profileSchema } from "@/lib/validation";
import { isUniqueConstraintError } from "@/lib/apiValidation";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    include: { ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } } },
  });
  if (!full) return new Response("Not found", { status: 404 });
  const { passwordHash, ...safe } = full;
  return NextResponse.json(safe);
}

// Self-service only: every field here applies to the caller's own account
// (user.id from the session), never a target id from the request body — so
// this route can be open to every role without becoming an escalation path.
//
// That "every role" openness is exactly why an active impersonation session
// must be blocked here explicitly: during impersonation, user.id is the
// TARGET's id (see the JWT swap in src/lib/auth.ts), so without this check
// an admin impersonating someone could silently change that person's real
// password or email through their own self-service route.
export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user.impersonating) {
    return NextResponse.json({ error: "Profile changes are disabled while impersonating another user." }, { status: 403 });
  }

  let body;
  try {
    body = profileSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.email !== undefined) data.email = body.email ? body.email.toLowerCase().trim() : null;
  if (body.avatarColor) data.avatarColor = body.avatarColor;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;

  if (body.newPassword) {
    if (!body.currentPassword) {
      return NextResponse.json({ error: "Enter your current password to set a new one." }, { status: 400 });
    }
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    const valid = await bcrypt.compare(body.currentPassword, dbUser.passwordHash);
    if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.newPassword, 10);
    data.mustChangePassword = false;
  }

  try {
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await logAudit(user.id, "profile.update", "User", user.id, {
      name: !!body.name, email: !!body.email, passwordChanged: !!body.newPassword, avatarColor: !!body.avatarColor, avatarUrl: body.avatarUrl !== undefined,
    });
    const { passwordHash, ...safe } = updated;
    return NextResponse.json(safe);
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't save changes." }, { status: 500 });
  }
}
