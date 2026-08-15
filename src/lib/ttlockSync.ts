import { prisma } from "@/lib/prisma";
import { listTtlockLocks } from "@/lib/ttlock/client";
import { recordTtlockOutcome } from "@/lib/access/service";

export type TtlockSyncResult = { unit: string; ok: boolean; battery?: number; error?: string };

/**
 * Daily fallback battery/gateway sync — covers any unit whose lock hasn't
 * generated a real unlock event recently enough for the webhook
 * (src/app/api/webhooks/ttlock/[secret]/route.ts) to have updated it.
 * Structured like syncAllUnitsFromAirbnb() in icalSync.ts: one lock list
 * call, then per-unit updates that never let one failure abort the rest —
 * a single TTLock outage during the cron run must still let every other
 * unit's already-known-good data stand, not get wiped or skipped.
 */
export async function syncAllUnitLocks(): Promise<TtlockSyncResult[]> {
  const units = await prisma.unit.findMany({ where: { ttlockLockId: { not: null } }, select: { id: true, shortName: true, ttlockLockId: true } });
  if (units.length === 0) return [];

  let locks;
  try {
    locks = await listTtlockLocks();
    await recordTtlockOutcome(true);
  } catch (e) {
    const message = e instanceof Error ? e.message : "TTLock request failed";
    await recordTtlockOutcome(false, message);
    // The whole call failed (auth/network) — every linked unit gets the
    // same error recorded rather than silently going stale with no signal.
    await prisma.unit.updateMany({ where: { ttlockLockId: { not: null } }, data: { ttlockSyncError: message } });
    return units.map((u) => ({ unit: u.shortName, ok: false, error: message }));
  }

  const byLockId = new Map(locks.map((l) => [l.lockId, l]));
  const results: TtlockSyncResult[] = [];

  for (const unit of units) {
    const lock = byLockId.get(unit.ttlockLockId!);
    if (!lock) {
      await prisma.unit
        .update({ where: { id: unit.id }, data: { ttlockSyncError: "Lock no longer found on the TTLock account" } })
        .catch(() => {});
      results.push({ unit: unit.shortName, ok: false, error: "Lock no longer found on the TTLock account" });
      continue;
    }
    await prisma.unit
      .update({
        where: { id: unit.id },
        data: {
          ttlockBatteryPct: lock.electricQuantity,
          ttlockHasGateway: lock.hasGateway === 1,
          ttlockBatterySyncedAt: new Date(),
          ttlockSyncError: null,
        },
      })
      .catch(() => {});
    results.push({ unit: unit.shortName, ok: true, battery: lock.electricQuantity });
  }

  return results;
}
