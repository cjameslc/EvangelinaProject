import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";

/**
 * Step 1 of 2 for the multi-staycation switcher — same split as
 * /api/admin/impersonate/start: this route does the real validation and
 * writes the audit trail server-side, then the client follows it with
 * useSession().update({ __switchOwner: { ownerId } }), which re-validates
 * against OwnerAccess again (see the jwt() callback in src/lib/auth.ts)
 * before actually swapping the token. That second check is the one that
 * actually enforces the boundary; this route exists so a rejected switch
 * gets a real error message instead of a silently-ignored client update().
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  // Allowed while impersonating — an admin experiencing exactly what a
  // target user sees (the whole point of impersonation) should also be
  // able to see what that user sees at a second property they're granted
  // access to, same as the target could themselves. This switches the
  // impersonated view, not the real admin's own session — see the jwt()
  // callback in auth.ts, which never touches the realUser snapshot used to
  // restore the admin when impersonation ends.
  const body = await req.json().catch(() => null);
  const ownerId = typeof body?.ownerId === "string" ? body.ownerId : null;
  if (!ownerId) return NextResponse.json({ error: "Missing ownerId." }, { status: 400 });

  const access = await prisma.ownerAccess.findUnique({
    where: { userId_ownerId: { userId: user.id, ownerId } },
    select: { role: true, owner: { select: { id: true, businessName: true, status: true } } },
  });
  if (!access) return NextResponse.json({ error: "You don't have access to that staycation." }, { status: 403 });
  if (access.owner.status !== "ACTIVE") return NextResponse.json({ error: "That staycation is currently suspended." }, { status: 403 });

  if (access.owner.id !== user.ownerId) {
    await logAudit(user.id, "user.switch_staycation", "Owner", access.owner.id, { businessName: access.owner.businessName, role: access.role });
  }

  return NextResponse.json({ ownerId: access.owner.id, businessName: access.owner.businessName, role: access.role });
}
