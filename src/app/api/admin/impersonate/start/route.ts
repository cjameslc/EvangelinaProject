import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";

/**
 * Step 1 of 2 for starting impersonation. This route does every real
 * validation and writes the audit-log row server-side (with IP/user-agent,
 * which only a real request has access to). It does NOT touch the session
 * cookie itself — the client follows this call with
 * `useSession().update({ __impersonate: { action: "start", sessionId } })`,
 * which re-validates against this same row (see the jwt() callback in
 * src/lib/auth.ts) before actually swapping the token. Splitting it this
 * way keeps 100% of the identity-swap logic inside NextAuth's own signed
 * cookie flow instead of hand-rolling cookie encoding here.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  if (user.impersonating) {
    return NextResponse.json({ error: "You're already impersonating someone — return to your account first." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : null;
  if (!targetUserId) return NextResponse.json({ error: "Missing targetUserId." }, { status: 400 });
  if (targetUserId === user.id) return NextResponse.json({ error: "You can't impersonate yourself." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  // Tenant boundary — without this, any Owner/Admin could pass another
  // tenant's userId and obtain a live session inside that tenant's account.
  // Same 404 as "not found" rather than 403, so this endpoint doesn't
  // confirm/deny whether a given userId exists in another tenant at all.
  if (!target || !target.active || target.ownerId !== user.ownerId) return NextResponse.json({ error: "That user wasn't found or is deactivated." }, { status: 404 });
  if (target.role === "OWNER_ADMIN") return NextResponse.json({ error: "Impersonating another Super Admin isn't allowed." }, { status: 403 });

  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent") || null;

  const record = await prisma.impersonationSession.create({
    data: {
      adminUserId: user.id, adminName: user.name, adminUsername: user.username,
      targetUserId: target.id, targetName: target.name, targetUsername: target.username, targetRole: target.role,
      ipAddress: ip, userAgent, reason,
    },
  });

  await logAudit(user.id, "user.impersonate_start", "User", target.id, { targetName: target.name, targetRole: target.role, sessionId: record.id, reason });

  return NextResponse.json({ sessionId: record.id, target: { id: target.id, name: target.name, role: target.role } });
}
