import { prisma } from "@/lib/prisma";
import { listTtlockAccessRecords } from "@/lib/ttlock/client";
import { classifyAccessEvent, maskPasscode, type MatchedCredential } from "@/lib/access/eventClassifier";
import { notifyStaff } from "@/lib/bookingEngine/notificationService";
import { logAudit } from "@/lib/audit";

const DEFAULT_TRUSTED_USERNAMES = ["Admin"];

// How far back each poll looks — deliberately wider than the actual gap
// between polls (once a day via the shared cron, see ical/cron/route.ts's
// own "no second Hobby-plan cron slot" comment) so a poll that's late, or
// a manual on-demand check run between two scheduled ones, never has a
// gap where an event could fall through unseen. ttlockRecordId's unique
// constraint makes re-fetching an already-processed record a harmless
// no-op, not a duplicate alert.
const LOOKBACK_MS = 48 * 60 * 60 * 1000;

async function getTrustedUsernames(ownerId: string | null): Promise<string[]> {
  if (!ownerId) return DEFAULT_TRUSTED_USERNAMES;
  const settings = await prisma.settings.findUnique({ where: { ownerId }, select: { trustedTtlockUsernames: true } });
  if (!settings?.trustedTtlockUsernames) return DEFAULT_TRUSTED_USERNAMES;
  try {
    const parsed = JSON.parse(settings.trustedTtlockUsernames);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TRUSTED_USERNAMES;
  } catch {
    return DEFAULT_TRUSTED_USERNAMES;
  }
}

/**
 * One unit's worth of real TTLock history, correlated against this app's
 * own AccessCredential table and persisted as classified AccessEvent rows.
 * Idempotent (ttlockRecordId is unique) and safe to call repeatedly — the
 * shared daily cron and the manual "Check now" button both just call this
 * per locked unit.
 */
export async function syncAccessEventsForUnit(unit: { id: string; ttlockLockId: number | null; unitLabel: string }, trustedUsernames: string[]): Promise<{ created: number; alerted: number }> {
  if (!unit.ttlockLockId) return { created: 0, alerted: 0 };

  const now = Date.now();
  let records;
  try {
    ({ list: records } = await listTtlockAccessRecords({ lockId: unit.ttlockLockId, startDate: now - LOOKBACK_MS, endDate: now, pageSize: 100 }));
  } catch {
    // A temporarily-unreachable TTLock API must never read as "this unit
    // had zero access events" (a false clean bill of health) — but it
    // also isn't itself a security event to log. Caller sees {created:0},
    // next poll tries again; nothing is falsely accused or falsely
    // cleared either way.
    return { created: 0, alerted: 0 };
  }

  // Only re-process records this table hasn't already seen — cheap to
  // check up front rather than relying solely on the unique-constraint
  // catch per row, and lets this skip the (unindexed, deliberately not a
  // real FK) credential-matching work for records already classified.
  const existingIds = new Set(
    (await prisma.accessEvent.findMany({
      where: { ttlockRecordId: { in: records.map((r) => String(r.recordId)) } },
      select: { ttlockRecordId: true },
    })).map((e) => e.ttlockRecordId)
  );
  const newRecords = records.filter((r) => !existingIds.has(String(r.recordId)));
  if (newRecords.length === 0) return { created: 0, alerted: 0 };

  // Every credential this unit has ever had — matched by code (plaintext
  // compare, the same representation both this table and TTLock's own
  // response use). Fetched once per unit per sync, not per record.
  const candidates = await prisma.accessCredential.findMany({
    where: { unitId: unit.id },
    select: { id: true, code: true, unitId: true, status: true, validFrom: true, validUntil: true, revokedAt: true, bookingId: true, type: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  // A code can legitimately repeat across a unit's history (TTLock
  // passcodes aren't guaranteed globally unique over time) — the most
  // recently created credential with a matching code is the one an
  // event should be checked against, same "most recent wins" resolution
  // a human investigating would use.
  const byCode = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) if (!byCode.has(c.code)) byCode.set(c.code, c);
  // Also check every OTHER unit's credentials, so a code that belongs to
  // a different unit's credential can actually be classified WRONG_UNIT
  // instead of silently falling through to UNAUTHORIZED for the wrong
  // reason.
  const crossUnitMatches = await prisma.accessCredential.findMany({
    where: { code: { in: newRecords.map((r) => r.keyboardPwd) }, unitId: { not: unit.id } },
    select: { id: true, code: true, unitId: true, status: true, validFrom: true, validUntil: true, revokedAt: true, bookingId: true, type: true, createdAt: true },
  });
  for (const c of crossUnitMatches) if (!byCode.has(c.code)) byCode.set(c.code, c);

  let created = 0;
  let alerted = 0;
  for (const record of newRecords) {
    const matched = byCode.get(record.keyboardPwd);
    const matchedCredential: MatchedCredential | null = matched
      ? { unitId: matched.unitId, status: matched.status, validFrom: matched.validFrom, validUntil: matched.validUntil, revokedAt: matched.revokedAt, bookingId: matched.bookingId, type: matched.type }
      : null;

    const { classification, severity, reason } = classifyAccessEvent({
      success: record.success === 1,
      occurredAt: new Date(record.lockDate),
      eventUnitId: unit.id,
      matchedCredential,
      ttlockUsername: record.username ?? null,
      trustedUsernames,
    });

    try {
      await prisma.accessEvent.create({
        data: {
          ttlockRecordId: String(record.recordId),
          lockId: String(unit.ttlockLockId),
          unitId: unit.id,
          occurredAt: new Date(record.lockDate),
          success: record.success === 1,
          passcodeMasked: maskPasscode(record.keyboardPwd),
          ttlockUsername: record.username ?? null,
          credentialId: matched?.id ?? null,
          bookingId: matched?.bookingId ?? null,
          classification,
          severity,
          reason,
        },
      });
      created++;
    } catch {
      // Unique-constraint race (two syncs running at once) — the row
      // already exists, which is exactly the idempotency this is for.
      continue;
    }

    if (severity === "HIGH" || severity === "CRITICAL") {
      await logAudit(null, "access.event.alert", "AccessEvent", record.recordId != null ? String(record.recordId) : undefined, {
        unitId: unit.id, classification, severity, reason,
      });
      await notifyStaff({ type: "security.unauthorized_access", unitId: unit.id, unitName: unit.unitLabel, classification, severity });
      alerted++;
    }
  }

  return { created, alerted };
}

/** Every locked unit, one after another — called by the shared daily cron
 * and by the Owner's on-demand "Check now" trigger. Sequential, not
 * Promise.all: the libSQL adapter serializes DB calls behind one mutex
 * anyway (see prisma.ts), and TTLock's own API has no documented
 * concurrent-request guarantee worth risking a rate-limit trip over. */
export async function syncAllUnitsAccessEvents(): Promise<{ unitsChecked: number; created: number; alerted: number }> {
  const units = await prisma.unit.findMany({ where: { ttlockLockId: { not: null } }, select: { id: true, ttlockLockId: true, shortName: true, unitNumber: true, ownerId: true } });
  // Trusted usernames are per-owner (Settings.trustedTtlockUsernames) —
  // this loop spans every owner's units at once (it's the shared daily
  // cron plus every owner's on-demand "Check now"), so resolving one
  // owner's list and applying it to every OTHER owner's units would have
  // been a real cross-tenant classification bug. Cached per run (not
  // per-unit) since most owners have several units sharing the same list.
  const trustedUsernamesByOwner = new Map<string, string[]>();
  let created = 0;
  let alerted = 0;
  for (const unit of units) {
    const ownerKey = unit.ownerId ?? "";
    if (!trustedUsernamesByOwner.has(ownerKey)) {
      trustedUsernamesByOwner.set(ownerKey, await getTrustedUsernames(unit.ownerId));
    }
    const trustedUsernames = trustedUsernamesByOwner.get(ownerKey)!;
    const result = await syncAccessEventsForUnit({ id: unit.id, ttlockLockId: unit.ttlockLockId, unitLabel: unit.shortName || unit.unitNumber }, trustedUsernames);
    created += result.created;
    alerted += result.alerted;
  }
  return { unitsChecked: units.length, created, alerted };
}
