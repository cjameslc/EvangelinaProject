import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { listTtlockLocks } from "@/lib/ttlock/client";
import { recordTtlockOutcome } from "@/lib/ttlock/reliability";

// Admin → Units "Link TTLock lock" dropdown data — the live lock list from
// TTLock (not a cached DB copy), cross-referenced against which units
// already have a lock linked so the dropdown only ever offers real,
// currently-unmapped locks. OWNER_ADMIN-only, same as every other Units-tab
// write/config read.
export async function GET() {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  let locks;
  try {
    locks = await listTtlockLocks();
    await recordTtlockOutcome(true);
  } catch (e) {
    const message = e instanceof Error ? e.message : "TTLock request failed";
    await recordTtlockOutcome(false, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const mappedLockIds = new Set(
    (await prisma.unit.findMany({ where: { ttlockLockId: { not: null } }, select: { ttlockLockId: true } })).map(
      (u) => u.ttlockLockId
    )
  );

  return NextResponse.json(
    locks.map((l) => ({
      lockId: l.lockId,
      lockAlias: l.lockAlias,
      lockName: l.lockName,
      electricQuantity: l.electricQuantity,
      hasGateway: l.hasGateway === 1,
      alreadyLinked: mappedLockIds.has(l.lockId),
    }))
  );
}
