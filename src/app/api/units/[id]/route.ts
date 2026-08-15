import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { unitSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  // Was missing entirely — the single most severe gap found in this whole
  // audit: any OWNER_ADMIN, from any tenant, could PATCH or DELETE any
  // unit on the platform by id, including another tenant's real property
  // records (name, rates, TTLock lock id, active status, owner
  // assignments). Found while investigating a much smaller Bill.ownerId
  // fix — every other unit-targeted route in this app already had this
  // check; this one, oddly, never did.
  if (!await isUnitInScope(user, params.id)) return forbiddenUnitScopeResponse(user);

  const { ownerUserIds, icalImportUrl, ...body } = unitSchema.partial().parse(await req.json());
  // Single-row, admin-only, low-frequency action — worth the extra query to
  // capture what these fields said before the edit, for the audit trail.
  const existing = await prisma.unit.findUnique({ where: { id: params.id } });
  const before: Record<string, unknown> = {};
  if (existing) for (const k of Object.keys(body)) if (k in existing) before[k] = (existing as any)[k];
  const unit = await prisma.unit.update({
    where: { id: params.id },
    data: { ...body, ...(icalImportUrl !== undefined && { icalImportUrl: icalImportUrl || null }) },
  });
  if (ownerUserIds !== undefined) {
    // Replace the unit's owner set wholesale — simpler and safer than diffing,
    // and this list is short enough that it's never a performance concern.
    await prisma.unitOwner.deleteMany({ where: { unitId: unit.id } });
    if (ownerUserIds.length) {
      await prisma.unitOwner.createMany({ data: ownerUserIds.map((userId) => ({ userId, unitId: unit.id })) });
    }
  }
  await logAudit(user.id, "unit.update", "Unit", unit.id, { before, after: { ...body, ownerUserIds } });
  return NextResponse.json(unit);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!await isUnitInScope(user, params.id)) return forbiddenUnitScopeResponse(user);

  // Booking/Bill/CleaningLog are Restrict, not Cascade, at the DB level
  // (see schema.prisma) specifically so a unit with real history can never
  // be deleted out from under it — this check exists only to turn that
  // into a clear, specific error instead of a raw FK-violation 500.
  const [bookingCount, billCount, cleaningLogCount] = await Promise.all([
    prisma.booking.count({ where: { unitId: params.id } }),
    prisma.bill.count({ where: { unitId: params.id } }),
    prisma.cleaningLog.count({ where: { unitId: params.id } }),
  ]);
  const blockers: string[] = [];
  if (bookingCount > 0) blockers.push(`${bookingCount} booking${bookingCount !== 1 ? "s" : ""}`);
  if (billCount > 0) blockers.push(`${billCount} bill${billCount !== 1 ? "s" : ""}`);
  if (cleaningLogCount > 0) blockers.push(`${cleaningLogCount} cleaning log${cleaningLogCount !== 1 ? "s" : ""}`);
  if (blockers.length > 0) {
    return NextResponse.json(
      { error: `Can't delete this unit — it still has ${blockers.join(", ")} on record. Remove or reassign those first.` },
      { status: 409 }
    );
  }

  // .delete() already returns the deleted row — no extra query needed to
  // capture it for the audit trail.
  const deleted = await prisma.unit.delete({ where: { id: params.id } });
  await logAudit(user.id, "unit.delete", "Unit", params.id, { before: deleted });
  return NextResponse.json({ ok: true });
}
