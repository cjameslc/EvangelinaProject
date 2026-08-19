import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/ownerScope";
import { logAudit } from "@/lib/session";
import { ensureEmployeeForOwnerAccess } from "@/lib/employeeProvision";

const VALID_ROLES = ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER", "AUDITOR"];

/**
 * Grants an EXISTING user access to switch into a second staycation — the
 * additive counterpart to POST /api/platform/owners/[id]/staff, which
 * creates a genuinely new, separate login instead (see that route's own
 * doc comment). This is the new path: same identity, same login, now able
 * to switch (see StaycationSwitcher.tsx / OwnerAccess). Platform-admin-only
 * by design — cross-tenant visibility is never something one owner's own
 * admin can hand out into another owner's data (see requirePlatformAdmin's
 * own doc comment in ownerScope.ts).
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const ownerId = typeof body?.ownerId === "string" ? body.ownerId : null;
  const role = typeof body?.role === "string" ? body.role : null;
  if (!userId || !ownerId || !role) return NextResponse.json({ error: "userId, ownerId, and role are all required." }, { status: 400 });
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Not a real role." }, { status: 400 });

  const [target, owner] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, active: true } }),
    prisma.owner.findUnique({ where: { id: ownerId }, select: { id: true, businessName: true } }),
  ]);
  if (!target || !target.active) return NextResponse.json({ error: "That user wasn't found or is deactivated." }, { status: 404 });
  if (!owner) return NextResponse.json({ error: "That staycation wasn't found." }, { status: 404 });

  const existing = await prisma.ownerAccess.findUnique({ where: { userId_ownerId: { userId, ownerId } } });
  if (existing) {
    return NextResponse.json({ error: `${target.name} already has access to ${owner.businessName}.` }, { status: 409 });
  }

  const access = await prisma.ownerAccess.create({
    data: { userId, ownerId, role },
    select: { role: true, owner: { select: { id: true, businessName: true } }, user: { select: { name: true, username: true } } },
  });

  // Without this, the grant exists but is functionally useless the moment
  // the person switches in — Bookings' "who am I" lookup (ownEmployeeId)
  // comes back null, leaving the Booker field blank with nothing to select
  // (the real bug this fixes, reported live on The Felian). See
  // ensureEmployeeForOwnerAccess's own doc comment for the full story.
  await ensureEmployeeForOwnerAccess({ id: userId, name: target.name, role }, ownerId);

  await logAudit(user.id, "user.grant_staycation_access", "User", userId, { ownerId, businessName: owner.businessName, role });

  return NextResponse.json({
    userId,
    userName: access.user.name,
    username: access.user.username,
    ownerId: access.owner.id,
    businessName: access.owner.businessName,
    role: access.role,
  });
}
