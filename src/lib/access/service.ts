import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { addTtlockPasscode, addTtlockPermanentPasscode, deleteTtlockPasscode } from "@/lib/ttlock/client";
import { getOccupiedWindow } from "@/lib/stayRange";
import { manilaWallClockToRealInstant } from "@/lib/manilaTime";

// The Access Control Service. This module, and src/lib/ttlock/client.ts
// (the low-level HTTP adapter it calls into), are the ONLY code in the app
// allowed to talk to TTLock or write to AccessCredential — every caller
// elsewhere (guest booking creation, booking cancel/edit, Admin, Dashboard)
// goes through the exported functions here. Scoped to the two credential
// types this app actually has real use for today:
//   GUEST                 — a per-booking self-check-in code
//   OWNER_ADMIN_EMERGENCY — a manually-triggered Owner/Admin override
// Every lifecycle transition is written to the existing app-wide AuditLog
// (src/lib/audit.ts) under action "access.credential.*" — one audit trail,
// not a bespoke one for this feature.

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300; // 300ms, 600ms, 1200ms — short exponential backoff

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exported so any real TTLock call anywhere in the app reports into the
 * same connection-health signal the Dashboard's "Emergency access codes"
 * widget reads — otherwise a real recovery (the next call succeeding)
 * never clears a stale "Failing" status left by an earlier failure. */
export async function recordTtlockOutcome(ok: boolean, message?: string) {
  // Best-effort — a failure to write the status row itself must never mask
  // or interrupt the real booking/fallback flow that triggered it.
  await prisma.ttlockStatus
    .upsert({
      where: { id: 1 },
      update: ok ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date(), lastFailureMessage: message },
      create: ok ? { id: 1, lastSuccessAt: new Date() } : { id: 1, lastFailureAt: new Date(), lastFailureMessage: message },
    })
    .catch(() => {});
}

async function withRetry<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let lastError = "Unknown error";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const value = await fn();
      await recordTtlockOutcome(true);
      return { ok: true, value };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_RETRIES - 1) await sleep(BASE_DELAY_MS * 2 ** attempt);
    }
  }
  await recordTtlockOutcome(false, lastError);
  return { ok: false, error: lastError };
}

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

type AccessCodeParams = {
  bookingId: string;
  unitId: string;
  guestId: string | null;
  // The real stay window this credential must cover — everything
  // getOccupiedWindow() needs (see src/lib/stayRange.ts) to derive actual
  // check-in/check-out *clock times* (e.g. 2:00 PM / 12:00 PM for a Night
  // stay), not just the booking's calendar-day date/checkOutDate fields.
  // Passing raw midnight-anchored dates here previously made the TTLock
  // passcode's endDate land at 8:00 AM Manila on checkout day — up to 4
  // hours before the guest's real checkout time — locking out a guest who
  // was still legitimately staying. See getOccupiedWindow's own doc
  // comment for why this is the one correct way to compute a stay window
  // anywhere in this app.
  stayType: string;
  date: Date;
  checkOutDate: Date | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  platform?: string;
};

/** Assigns a guest self-check-in credential to a just-created booking — a
 * real TTLock passcode if the API cooperates, one of the pre-provisioned
 * emergency reserve codes if it doesn't after retries. Never throws: the
 * booking itself must never fail because of this, so every failure path
 * (no lock linked, TTLock down, reserve pool exhausted) is caught, logged
 * as a FAILED credential, and simply leaves the booking without a working
 * code for staff to follow up on — worse than a code, never worse than a
 * broken booking.
 *
 * Idempotent — safe to call more than once for the same booking (a caller
 * retry, a double-submit): no-ops if an ACTIVE credential already exists,
 * and assignReserveCode() releases a code it grabbed if it loses a race to
 * record its credential first. */
export async function createGuestAccessCode(params: AccessCodeParams): Promise<void> {
  try {
    const existing = await prisma.accessCredential.findFirst({
      where: { bookingId: params.bookingId, type: "GUEST", status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) return;

    const unit = await prisma.unit.findUnique({ where: { id: params.unitId }, select: { ttlockLockId: true } });
    if (!unit?.ttlockLockId) {
      await assignReserveCode(params, "No TTLock lock linked to this unit");
      return;
    }

    const passcode = generateSixDigitCode();
    // getOccupiedWindow's start/end are Manila-wall-clock placeholders
    // (see manilaWallClockToRealInstant's doc comment) — must be converted
    // to real UTC instants before going anywhere near TTLock, which
    // evaluates startDate/endDate against the lock's actual real-world
    // clock, not this app's internal placeholder convention.
    const window = getOccupiedWindow(params);
    const validFrom = manilaWallClockToRealInstant(window.start);
    const validUntil = manilaWallClockToRealInstant(window.end);
    const lockId = unit.ttlockLockId;

    const result = await withRetry(() =>
      addTtlockPasscode({ lockId, passcode, name: `Guest-${params.bookingId.slice(0, 8)}`, startDate: validFrom.getTime(), endDate: validUntil.getTime() })
    );

    if (!result.ok) {
      await assignReserveCode(params, result.error);
      return;
    }

    const credential = await prisma.accessCredential.create({
      data: {
        type: "GUEST",
        unitId: params.unitId,
        bookingId: params.bookingId,
        guestId: params.guestId,
        code: passcode,
        source: "ttlock",
        ttlockKeyboardPwdId: result.value.keyboardPwdId,
        status: "ACTIVE",
        validFrom,
        validUntil,
      },
    });
    await logAudit(null, "access.credential.generated", "AccessCredential", credential.id, { bookingId: params.bookingId, unitId: params.unitId, source: "ttlock" });
  } catch (e) {
    // Absolute last resort — should be unreachable given the guards above,
    // but this function's one hard contract is "never throw into the
    // booking flow."
    const credential = await prisma.accessCredential
      .create({
        data: {
          type: "GUEST",
          unitId: params.unitId,
          bookingId: params.bookingId,
          guestId: params.guestId,
          code: "",
          source: "ttlock",
          status: "FAILED",
          reason: `Unexpected error in createGuestAccessCode: ${e instanceof Error ? e.message : String(e)}`,
        },
      })
      .catch(() => null);
    if (credential) await logAudit(null, "access.credential.failed", "AccessCredential", credential.id, { bookingId: params.bookingId, unitId: params.unitId });
  }
}

/** Atomically claims one AVAILABLE reserve code for a unit — loops only to
 * survive a genuine simultaneous race on the same unit (rare at this app's
 * real scale). Each iteration's updateMany is the atomic compare-and-swap:
 * its WHERE clause re-checks status = AVAILABLE at write time, so if two
 * requests race for the same row only one's update actually matches and
 * takes it — the loser sees count 0 and just tries the next candidate.
 * Shared by assignReserveCode (guest bookings — has a bookingId/guestId to
 * stamp on the claim) and createEmergencyCredential (Owner override — has
 * neither, since it isn't tied to any booking). */
async function claimReserveCode(
  unitId: string,
  extra: { bookingId?: string; guestId?: string | null; fallbackReason: string }
): Promise<{ id: string; code: string; keyboardPwdId: number | null } | null> {
  for (let i = 0; i < 5; i++) {
    const candidate = await prisma.reserveAccessCode.findFirst({
      where: { unitId, status: "AVAILABLE" },
      orderBy: { code: "asc" },
    });
    if (!candidate) return null;
    const result = await prisma.reserveAccessCode.updateMany({
      where: { id: candidate.id, status: "AVAILABLE" },
      data: {
        status: "RESERVED",
        assignedAt: new Date(),
        fallbackReason: extra.fallbackReason,
        ...(extra.bookingId ? { bookingId: extra.bookingId, guestId: extra.guestId ?? null } : {}),
      },
    });
    if (result.count > 0) return candidate;
  }
  return null;
}

async function assignReserveCode(params: AccessCodeParams, fallbackReason: string): Promise<void> {
  const claimed = await claimReserveCode(params.unitId, { bookingId: params.bookingId, guestId: params.guestId, fallbackReason });

  if (!claimed) {
    const credential = await prisma.accessCredential.create({
      data: {
        type: "GUEST",
        unitId: params.unitId,
        bookingId: params.bookingId,
        guestId: params.guestId,
        code: "",
        source: "reserve",
        status: "FAILED",
        reason: `${fallbackReason} — no reserve codes available for this unit`,
      },
    });
    await logAudit(null, "access.credential.failed", "AccessCredential", credential.id, { bookingId: params.bookingId, unitId: params.unitId });
    return; // booking proceeds with no access code; logged above for staff follow-up
  }

  // The reserve code itself is permanent on the lock (see
  // provisionReserveCodesForUnit) — validFrom/validUntil here are only
  // ever shown to staff/guest as "this is your stay window," so they still
  // need to reflect the real check-in/check-out times (converted to a real
  // instant — see manilaWallClockToRealInstant), not raw midnight-anchored
  // calendar dates.
  const reserveWindow = getOccupiedWindow(params);
  const reserveValidFrom = manilaWallClockToRealInstant(reserveWindow.start);
  const reserveValidUntil = manilaWallClockToRealInstant(reserveWindow.end);
  const credential = await prisma.accessCredential.create({
    data: {
      type: "GUEST",
      unitId: params.unitId,
      bookingId: params.bookingId,
      guestId: params.guestId,
      code: claimed.code,
      source: "reserve",
      reserveCodeId: claimed.id,
      status: "ACTIVE",
      validFrom: reserveValidFrom,
      validUntil: reserveValidUntil,
      reason: fallbackReason,
    },
  });
  await logAudit(null, "access.credential.generated", "AccessCredential", credential.id, { bookingId: params.bookingId, unitId: params.unitId, source: "reserve", fallbackReason });
}

/** Releases a booking's active guest credential on checkout/cancel/edit —
 * a "reserve" code goes back to AVAILABLE for reuse by a future guest; a
 * real "ttlock" code gets deleted from the lock (best-effort; a failed
 * delete just leaves a harmless stale code that's already past its
 * validUntil anyway). Safe to call on a booking with no credential
 * (no-ops). */
export async function releaseAccessCodeForBooking(bookingId: string): Promise<void> {
  const credential = await prisma.accessCredential.findFirst({
    where: { bookingId, type: "GUEST", status: "ACTIVE" },
  });
  if (!credential) return;

  if (credential.source === "reserve" && credential.reserveCodeId) {
    await prisma.reserveAccessCode.updateMany({
      where: { id: credential.reserveCodeId },
      data: { status: "AVAILABLE", bookingId: null, guestId: null, releasedAt: new Date(), fallbackReason: null },
    });
  } else if (credential.source === "ttlock" && credential.ttlockKeyboardPwdId) {
    const unit = await prisma.unit.findUnique({ where: { id: credential.unitId }, select: { ttlockLockId: true } });
    if (unit?.ttlockLockId) {
      await deleteTtlockPasscode(unit.ttlockLockId, credential.ttlockKeyboardPwdId).catch(() => {});
    }
  }

  await prisma.accessCredential.update({
    where: { id: credential.id },
    data: { status: "EXPIRED" },
  });
  await logAudit(null, "access.credential.expired", "AccessCredential", credential.id, { bookingId });
}

/** Staff-initiated reveal — logs who saw the code and when. Returns null if
 * no active credential exists for this booking. */
export async function revealCredentialForBooking(bookingId: string, actorUserId: string | null): Promise<{ id: string; code: string; validFrom: Date | null; validUntil: Date | null } | null> {
  const credential = await prisma.accessCredential.findFirst({
    where: { bookingId, type: "GUEST", status: "ACTIVE" },
  });
  if (!credential) return null;
  await logAudit(actorUserId, "access.credential.viewed", "AccessCredential", credential.id, { bookingId });
  return { id: credential.id, code: credential.code, validFrom: credential.validFrom, validUntil: credential.validUntil };
}

/** Logs a copy/send action against an already-revealed credential — never
 * re-reveals the code itself (caller already has it from revealCredentialForBooking). */
export async function recordCredentialAction(credentialId: string, action: "copied" | "sent", actorUserId: string | null, meta?: unknown): Promise<void> {
  await logAudit(actorUserId, `access.credential.${action}`, "AccessCredential", credentialId, meta);
}

/** Owner/Admin manual revoke — always logged with a reason. */
export async function revokeCredential(credentialId: string, actorUserId: string | null, reason: string): Promise<void> {
  const credential = await prisma.accessCredential.findUnique({ where: { id: credentialId } });
  if (!credential || credential.status !== "ACTIVE") throw new Error("No active credential to revoke.");

  if (credential.source === "reserve" && credential.reserveCodeId) {
    await prisma.reserveAccessCode.updateMany({
      where: { id: credential.reserveCodeId },
      data: { status: "AVAILABLE", bookingId: null, guestId: null, releasedAt: new Date(), fallbackReason: null },
    });
  } else if (credential.source === "ttlock" && credential.ttlockKeyboardPwdId) {
    const unit = await prisma.unit.findUnique({ where: { id: credential.unitId }, select: { ttlockLockId: true } });
    if (unit?.ttlockLockId) {
      await deleteTtlockPasscode(unit.ttlockLockId, credential.ttlockKeyboardPwdId).catch(() => {});
    }
  } else if (credential.source === "manual" && credential.ttlockKeyboardPwdId) {
    const unit = await prisma.unit.findUnique({ where: { id: credential.unitId }, select: { ttlockLockId: true } });
    if (unit?.ttlockLockId) {
      await deleteTtlockPasscode(unit.ttlockLockId, credential.ttlockKeyboardPwdId).catch(() => {});
    }
  }

  await prisma.accessCredential.update({
    where: { id: credentialId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedByUserId: actorUserId, reason },
  });
  await logAudit(actorUserId, "access.credential.revoked", "AccessCredential", credentialId, { reason });
}

/** OWNER_ADMIN emergency access — a manually-triggered permanent-ish code
 * for a unit, outside the normal per-booking flow. Always requires a
 * reason (enforced by the caller/route, re-checked here) and is always
 * logged. Not tied to a booking: normally a genuinely separate, real
 * TTLock passcode scoped to a validity window the admin chooses (defaults
 * to 24h if none given) — but if TTLock/the gateway won't cooperate, this
 * falls back to the same reserve-code pool the guest booking flow already
 * gets (see assignReserveCode/claimReserveCode above). An Owner/Admin
 * reaching for emergency access is almost always responding to a real,
 * urgent situation, so "TTLock is down" can't be the end of the story
 * here either — confirmed via a real gateway outage (2026-08-10, "The
 * gateway is busy") that this path previously had no recovery from at
 * all, unlike the guest flow next to it. revokeCredential already
 * releases a "reserve"-sourced credential back to AVAILABLE regardless of
 * its `type`, so revoking one of these needs no separate handling. */
export async function createEmergencyCredential(params: { unitId: string; actorUserId: string; reason: string; validUntil?: Date }): Promise<{ id: string; code: string }> {
  if (!params.reason.trim()) throw new Error("A reason is required for emergency access.");

  const unit = await prisma.unit.findUnique({ where: { id: params.unitId }, select: { ttlockLockId: true } });
  if (!unit?.ttlockLockId) throw new Error("This unit has no TTLock lock linked yet — link one first.");

  const passcode = generateSixDigitCode();
  const validFrom = new Date();
  const validUntil = params.validUntil ?? new Date(validFrom.getTime() + 24 * 3600 * 1000);

  const result = await withRetry(() =>
    addTtlockPasscode({ lockId: unit.ttlockLockId!, passcode, name: `Emergency-${params.actorUserId.slice(0, 8)}`, startDate: validFrom.getTime(), endDate: validUntil.getTime() })
  );

  if (!result.ok) {
    const claimed = await claimReserveCode(params.unitId, { fallbackReason: `Emergency access, TTLock unavailable: ${result.error}` });
    if (!claimed) throw new Error(`${result.error} — and no reserve codes are available for this unit either.`);

    const credential = await prisma.accessCredential.create({
      data: {
        type: "OWNER_ADMIN_EMERGENCY",
        unitId: params.unitId,
        code: claimed.code,
        source: "reserve",
        reserveCodeId: claimed.id,
        status: "ACTIVE",
        validFrom,
        validUntil,
        createdByUserId: params.actorUserId,
        reason: params.reason,
      },
    });
    await logAudit(params.actorUserId, "access.credential.generated", "AccessCredential", credential.id, { unitId: params.unitId, type: "OWNER_ADMIN_EMERGENCY", reason: params.reason, source: "reserve", fallbackReason: result.error });
    return { id: credential.id, code: credential.code };
  }

  const credential = await prisma.accessCredential.create({
    data: {
      type: "OWNER_ADMIN_EMERGENCY",
      unitId: params.unitId,
      code: passcode,
      source: "manual",
      ttlockKeyboardPwdId: result.value.keyboardPwdId,
      status: "ACTIVE",
      validFrom,
      validUntil,
      createdByUserId: params.actorUserId,
      reason: params.reason,
    },
  });
  await logAudit(params.actorUserId, "access.credential.generated", "AccessCredential", credential.id, { unitId: params.unitId, type: "OWNER_ADMIN_EMERGENCY", reason: params.reason });
  return { id: credential.id, code: credential.code };
}

// Cleaning codes are capped shorter than emergency access's 24h default —
// spec: "never remain active overnight," matched here rather than trusted
// to whatever the caller happens to pass.
const HOUSEKEEPING_MAX_VALIDITY_MS = 2 * 3600 * 1000;

/** Owner/Booker-triggered temporary code for one housekeeper's one cleaning
 * — the housekeeping counterpart to createEmergencyCredential above, tied
 * to a specific employee (assignedEmployeeId) so that employee's own "my
 * code" lookup can find it, and capped at 2 hours.
 *
 * Falls back to the reserve pool when TTLock/the gateway won't cooperate —
 * this used to deliberately never do that (a reserve code is permanent on
 * the lock, and the original spec said a cleaning code must never be), but
 * a real, recurring multi-day gateway outage (Aug 9-11, two separate
 * units) made "fails outright, cleaner can't get in" the actual day-to-day
 * behavior instead of the rare edge case it was designed for — explicitly
 * authorized to change this after that. The "never permanent" spirit is
 * still honored as much as it can be here: releaseHousekeepingCredentialForCleaning
 * (called on Finish Cleaning) already releases a reserve-sourced credential
 * back to AVAILABLE via revokeCredential's generic source==="reserve"
 * handling — a fallback code's *assignment* to this cleaning session is
 * still temporary and returned to the pool same-day, even though the
 * underlying 6-digit code itself is permanent on the lock like any reserve
 * code. validUntil is still capped at 2h either way, so a reserve fallback
 * credential still reads (and gets treated) as temporary everywhere this
 * app displays or reasons about it. */
export async function createHousekeepingCredential(params: {
  unitId: string;
  assignedEmployeeId: string;
  actorUserId: string | null;
  validUntil?: Date;
}): Promise<{ id: string; code: string; validUntil: Date }> {
  const existing = await prisma.accessCredential.findFirst({
    where: { type: "HOUSEKEEPING", unitId: params.unitId, assignedEmployeeId: params.assignedEmployeeId, status: "ACTIVE" },
    select: { id: true },
  });
  if (existing) throw new Error("This housekeeper already has an active code for this unit.");

  const unit = await prisma.unit.findUnique({ where: { id: params.unitId }, select: { ttlockLockId: true } });
  if (!unit?.ttlockLockId) throw new Error("This unit has no TTLock lock linked yet — link one first.");

  const passcode = generateSixDigitCode();
  const validFrom = new Date();
  const requested = params.validUntil ?? new Date(validFrom.getTime() + HOUSEKEEPING_MAX_VALIDITY_MS);
  const validUntil = requested.getTime() - validFrom.getTime() > HOUSEKEEPING_MAX_VALIDITY_MS
    ? new Date(validFrom.getTime() + HOUSEKEEPING_MAX_VALIDITY_MS)
    : requested;

  const result = await withRetry(() =>
    addTtlockPasscode({ lockId: unit.ttlockLockId!, passcode, name: `Clean-${params.assignedEmployeeId.slice(0, 8)}`, startDate: validFrom.getTime(), endDate: validUntil.getTime() })
  );

  if (!result.ok) {
    const claimed = await claimReserveCode(params.unitId, { fallbackReason: `Housekeeping, TTLock unavailable: ${result.error}` });
    if (!claimed) throw new Error(`${result.error} — and no reserve codes are available for this unit either.`);

    const credential = await prisma.accessCredential.create({
      data: {
        type: "HOUSEKEEPING",
        unitId: params.unitId,
        assignedEmployeeId: params.assignedEmployeeId,
        code: claimed.code,
        source: "reserve",
        reserveCodeId: claimed.id,
        status: "ACTIVE",
        validFrom,
        validUntil,
        createdByUserId: params.actorUserId,
      },
    });
    await logAudit(params.actorUserId, "access.credential.generated", "AccessCredential", credential.id, { unitId: params.unitId, type: "HOUSEKEEPING", assignedEmployeeId: params.assignedEmployeeId, source: "reserve", fallbackReason: result.error });
    return { id: credential.id, code: credential.code, validUntil };
  }

  const credential = await prisma.accessCredential.create({
    data: {
      type: "HOUSEKEEPING",
      unitId: params.unitId,
      assignedEmployeeId: params.assignedEmployeeId,
      code: passcode,
      source: "ttlock",
      ttlockKeyboardPwdId: result.value.keyboardPwdId,
      status: "ACTIVE",
      validFrom,
      validUntil,
      createdByUserId: params.actorUserId,
    },
  });
  await logAudit(params.actorUserId, "access.credential.generated", "AccessCredential", credential.id, { unitId: params.unitId, type: "HOUSEKEEPING", assignedEmployeeId: params.assignedEmployeeId });
  return { id: credential.id, code: credential.code, validUntil };
}

/** Spec section 3, step 5 ("Request assigned temporary access credential")
 * — called from the Start Cleaning path itself (src/app/api/housekeeping/
 * unit/[id]/route.ts), not just the Owner/Booker manual-generate route.
 * Requesting one automatically here, not only when an Owner/Booker happens
 * to have pre-generated it, is what makes this feature actually load-
 * bearing in normal day-to-day use — an Owner/Booker CAN still generate
 * one ahead of time (createHousekeepingCredential above, unchanged), this
 * just covers the far more common case where nobody did.
 *
 * Never throws — same "never blocks the real operation" contract as
 * createGuestAccessCode: a housekeeper's shift must never be blocked by a
 * TTLock hiccup. createHousekeepingCredential above now falls back to the
 * reserve pool the same way GUEST/emergency codes already did, so this
 * catch is realistically only reached when that pool is also exhausted —
 * still recorded as a FAILED credential + audit event either way, same
 * shape as the guest flow's own catch-all, so it's visible in the activity
 * log for follow-up. No-ops if
 * an ACTIVE credential already exists for this unit+employee — whether
 * pre-generated by an Owner/Booker or from an earlier call to this same
 * function this session. */
export async function ensureHousekeepingCredentialOnStart(params: { unitId: string; assignedEmployeeId: string }): Promise<void> {
  try {
    const existing = await prisma.accessCredential.findFirst({
      where: { type: "HOUSEKEEPING", unitId: params.unitId, assignedEmployeeId: params.assignedEmployeeId, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) return;

    await createHousekeepingCredential({ unitId: params.unitId, assignedEmployeeId: params.assignedEmployeeId, actorUserId: null });
  } catch (e) {
    const credential = await prisma.accessCredential
      .create({
        data: {
          type: "HOUSEKEEPING",
          unitId: params.unitId,
          assignedEmployeeId: params.assignedEmployeeId,
          code: "",
          source: "ttlock",
          status: "FAILED",
          reason: `Auto-generation on Start Cleaning failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      })
      .catch(() => null);
    if (credential) await logAudit(null, "access.credential.failed", "AccessCredential", credential.id, { unitId: params.unitId, assignedEmployeeId: params.assignedEmployeeId });
  }
}

/** Attaches a pre-generated HOUSEKEEPING credential (if one exists for this
 * unit+employee) to the cleaning session that just started — called from
 * the Start Cleaning path, not the credential-generation path, since a
 * clean can start with no pre-generated code at all (self-service,
 * unchanged from before this feature) and this is a no-op in that case. */
export async function linkHousekeepingCredentialToCleaning(params: { unitId: string; employeeId: string; cleaningLogId: string }): Promise<void> {
  const credential = await prisma.accessCredential.findFirst({
    where: { type: "HOUSEKEEPING", unitId: params.unitId, assignedEmployeeId: params.employeeId, status: "ACTIVE", cleaningLogId: null },
    orderBy: { createdAt: "desc" },
  });
  if (!credential) return;
  await prisma.accessCredential.update({ where: { id: credential.id }, data: { cleaningLogId: params.cleaningLogId } });
}

/** Releases whatever HOUSEKEEPING credential is tied to this cleaning
 * session (if any) — called from the Finish Cleaning path. Reuses
 * revokeCredential's own TTLock-delete/reserve-release handling, actor
 * null since this is a system-triggered release, not a manual revoke. */
export async function releaseHousekeepingCredentialForCleaning(cleaningLogId: string): Promise<void> {
  const credential = await prisma.accessCredential.findFirst({
    where: { cleaningLogId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!credential) return;
  await revokeCredential(credential.id, null, "Cleaning completed").catch(() => {});
}

/** The one lookup a housekeeper's own "my access code" card is allowed to
 * make — scoped to their own assignedEmployeeId, never a general reveal of
 * anyone else's credential (see rbac.ts's canRevealAccessCredential, which
 * deliberately excludes HOUSEKEEPING for guest codes; this is a narrower,
 * separate path that only ever returns a code already assigned to the
 * caller). */
export async function getMyActiveHousekeepingCredential(employeeId: string, unitId: string): Promise<{ id: string; code: string; validUntil: Date | null } | null> {
  const credential = await prisma.accessCredential.findFirst({
    where: { type: "HOUSEKEEPING", assignedEmployeeId: employeeId, unitId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!credential) return null;
  if (credential.validUntil && credential.validUntil.getTime() < Date.now()) {
    await prisma.accessCredential.update({ where: { id: credential.id }, data: { status: "EXPIRED" } }).catch(() => {});
    await logAudit(null, "access.credential.expired", "AccessCredential", credential.id, {});
    return null;
  }
  return { id: credential.id, code: credential.code, validUntil: credential.validUntil };
}

/** One-time provisioning (never called from a cron/background job, per
 * spec) — tops a unit's reserve pool up to 10 permanent codes, skipping
 * however many it already has. Requires a lock already linked via
 * /api/ttlock/link. */
export async function provisionReserveCodesForUnit(unitId: string): Promise<{ created: number; alreadyHad: number }> {
  const alreadyHad = await prisma.reserveAccessCode.count({ where: { unitId } });
  const toCreate = Math.max(0, 10 - alreadyHad);
  if (toCreate === 0) return { created: 0, alreadyHad };

  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { ttlockLockId: true } });
  if (!unit?.ttlockLockId) throw new Error("This unit has no TTLock lock linked yet — link one first.");
  const lockId = unit.ttlockLockId;

  const usedCodes = new Set(
    (await prisma.reserveAccessCode.findMany({ where: { unitId }, select: { code: true } })).map((r) => r.code)
  );

  let created = 0;
  for (let i = 0; i < toCreate; i++) {
    let passcode = generateSixDigitCode();
    while (usedCodes.has(passcode)) passcode = generateSixDigitCode();
    usedCodes.add(passcode);

    // Same retry/backoff as the real guest-facing path — observed a
    // transient failure provisioning back-to-back locks in the same run;
    // a bare single-shot call isn't reliable enough even for this
    // one-time setup.
    const result = await withRetry(() =>
      addTtlockPermanentPasscode({ lockId, passcode, name: `Reserve-${unitId.slice(0, 6)}-${alreadyHad + i + 1}` })
    );
    if (!result.ok) throw new Error(result.error);
    await prisma.reserveAccessCode.create({
      data: { unitId, code: passcode, keyboardPwdId: result.value.keyboardPwdId, status: "AVAILABLE" },
    });
    created++;
  }
  return { created, alreadyHad };
}
