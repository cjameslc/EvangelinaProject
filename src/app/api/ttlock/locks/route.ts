import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { listTtlockLocks } from "@/lib/ttlock/client";
import { recordTtlockOutcome } from "@/lib/access/service";

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

  // TTLock itself is one shared account-wide inventory (not per-tenant —
  // see Unit.ttlockLockId's unique constraint, enforced globally so a lock
  // can never be double-claimed across tenants), so a lock already linked
  // to ANY unit — this tenant's or another's — genuinely can't be offered
  // here. Previously this list still included those locks (with an
  // `alreadyLinked` flag the client filtered out itself), which meant one
  // tenant's Admin could see another tenant's lock aliases/names before
  // they were ever linked. The client already only ever used this to drop
  // them (UnitsTab.tsx's `.filter(l => !l.alreadyLinked)`), so excluding
  // them server-side instead is a strict behavior subset, not a change.
  const mappedLockIds = new Set(
    (await prisma.unit.findMany({ where: { ttlockLockId: { not: null } }, select: { ttlockLockId: true } })).map(
      (u) => u.ttlockLockId
    )
  );

  return NextResponse.json(
    locks
      .filter((l) => !mappedLockIds.has(l.lockId))
      .map((l) => ({
        lockId: l.lockId,
        lockAlias: l.lockAlias,
        lockName: l.lockName,
        electricQuantity: l.electricQuantity,
        hasGateway: l.hasGateway === 1,
      }))
  );
}
