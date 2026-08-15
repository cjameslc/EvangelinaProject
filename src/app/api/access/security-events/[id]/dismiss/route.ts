import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope, forbiddenUnitScopeResponse, logAudit } from "@/lib/session";
import { canRevokeAccessCredential } from "@/lib/rbac";

/**
 * Dismiss, never delete — security events are append-only (see
 * AccessEvent's own doc comment); this only ever sets dismissedAt/
 * dismissedByUserId, the row and its classification stay in the table
 * forever for later audit. Same role pairing as revoking a live
 * credential (canRevokeAccessCredential: Owner/Admin, Co-owner) — Auditor
 * can see everything canViewAccessHistory covers but deliberately can't
 * dismiss anything, since closing out a flagged event is an action, not
 * the oversight role Auditor exists for.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canRevokeAccessCredential(user.role as any)) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.accessEvent.findUnique({ where: { id: params.id }, select: { id: true, unitId: true, dismissedAt: true } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.unitId && !(await isUnitInScope(user, existing.unitId))) return forbiddenUnitScopeResponse(user);
  if (existing.dismissedAt) return NextResponse.json({ error: "Already dismissed." }, { status: 400 });

  const updated = await prisma.accessEvent.update({
    where: { id: params.id },
    data: { dismissedAt: new Date(), dismissedByUserId: user.id },
  });
  await logAudit(user.id, "access.event.dismissed", "AccessEvent", params.id, { unitId: existing.unitId });

  return NextResponse.json(updated);
}
