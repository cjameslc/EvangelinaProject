import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { listTtlockLocks } from "@/lib/ttlock/client";

const bodySchema = z.object({
  unitId: z.string().min(1),
  lockId: z.number().int().nullable(), // null unlinks the unit's current lock
});

// Links (or unlinks) a TTLock lock to a Unit. Re-fetches the live lock list
// server-side rather than trusting client-supplied battery/gateway values —
// the dropdown that drives this only ever shows what /api/ttlock/locks just
// returned, but the write itself re-verifies against TTLock directly so a
// linked unit's initial battery/gateway snapshot is always real, not
// whatever the browser happened to have cached.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const { unitId, lockId } = bodySchema.parse(await req.json());
  // Without this, any Owner/Admin could pass another tenant's unitId and
  // hijack that tenant's lock mapping (unlink a working lock, or claim a
  // lock onto the wrong unit).
  if (!await isUnitInScope(user, unitId)) return forbiddenUnitScopeResponse(user);

  if (lockId === null) {
    const unit = await prisma.unit.update({
      where: { id: unitId },
      data: {
        ttlockLockId: null,
        ttlockLockName: null,
        ttlockHasGateway: null,
        ttlockBatteryPct: null,
        ttlockBatterySyncedAt: null,
        ttlockSyncError: null,
      },
    });
    await logAudit(user.id, "unit.ttlock_unlink", "Unit", unit.id);
    return NextResponse.json(unit);
  }

  let locks;
  try {
    locks = await listTtlockLocks();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "TTLock request failed" }, { status: 502 });
  }
  const match = locks.find((l) => l.lockId === lockId);
  if (!match) return NextResponse.json({ error: "That lock is no longer available." }, { status: 404 });

  let unit;
  try {
    unit = await prisma.unit.update({
      where: { id: unitId },
      data: {
        ttlockLockId: match.lockId,
        ttlockLockName: match.lockAlias || match.lockName,
        ttlockHasGateway: match.hasGateway === 1,
        ttlockBatteryPct: match.electricQuantity,
        ttlockBatterySyncedAt: new Date(),
        ttlockSyncError: null,
      },
    });
  } catch {
    // Unique constraint on ttlockLockId — another unit already claimed it.
    return NextResponse.json({ error: "That lock is already linked to another unit." }, { status: 409 });
  }
  await logAudit(user.id, "unit.ttlock_link", "Unit", unit.id, { lockId: match.lockId, lockAlias: match.lockAlias });
  return NextResponse.json(unit);
}
