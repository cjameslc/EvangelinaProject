import { prisma } from "@/lib/prisma";
import { addTtlockPasscode, addTtlockPermanentPasscode, deleteTtlockPasscode } from "./client";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300; // 300ms, 600ms, 1200ms — short exponential backoff

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordTtlockOutcome(ok: boolean, message?: string) {
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

/** 2-3 attempts with short exponential backoff, per the fallback spec.
 * Records the outcome onto the singleton TtlockStatus row either way, so
 * the Owner Dashboard's "TTLock API connection status" reflects the most
 * recent real call, not a synthetic health check. */
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
  checkIn: Date;
  checkOut: Date | null;
};

/** Assigns a guest self-check-in code to a just-created booking — a real
 * TTLock passcode if the API cooperates, one of the 10 pre-provisioned
 * emergency reserve codes if it doesn't after retries. Never throws: the
 * booking itself must never fail because of this, so every failure path
 * (no lock linked, TTLock down, reserve pool exhausted) is caught, logged,
 * and simply leaves the booking without an access code for staff to
 * follow up on — worse than a code, never worse than a broken booking.
 *
 * Idempotent — safe to call more than once for the same booking (a caller
 * retry, a double-submit): the guard below no-ops if a code is already
 * assigned, and assignReserveCode() releases a code it grabbed if it loses
 * a race to set Booking.accessCode first. */
export async function createGuestAccessCode(params: AccessCodeParams): Promise<void> {
  try {
    const existing = await prisma.booking.findUnique({ where: { id: params.bookingId }, select: { accessCode: true } });
    if (existing?.accessCode) return;

    const unit = await prisma.unit.findUnique({ where: { id: params.unitId }, select: { ttlockLockId: true } });
    if (!unit?.ttlockLockId) {
      await assignReserveCode(params, "No TTLock lock linked to this unit");
      return;
    }

    const passcode = generateSixDigitCode();
    const startDate = params.checkIn.getTime();
    const endDate = (params.checkOut ?? new Date(params.checkIn.getTime() + 24 * 3600 * 1000)).getTime();
    const lockId = unit.ttlockLockId;

    const result = await withRetry(() =>
      addTtlockPasscode({ lockId, passcode, name: `Guest-${params.bookingId.slice(0, 8)}`, startDate, endDate })
    );

    if (!result.ok) {
      await assignReserveCode(params, result.error);
      return;
    }

    const updated = await prisma.booking.updateMany({
      where: { id: params.bookingId, accessCode: null },
      data: {
        accessCode: passcode,
        accessCodeSource: "ttlock",
        accessCodeKeyboardPwdId: result.value.keyboardPwdId,
        accessCodeAssignedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      // Lost a race to a concurrent call that already set a code — this
      // one is now an orphaned real passcode on the lock; delete it rather
      // than leaving an unused live code behind.
      await deleteTtlockPasscode(lockId, result.value.keyboardPwdId).catch(() => {});
    }
  } catch (e) {
    // Absolute last resort — should be unreachable given the guards above,
    // but this function's one hard contract is "never throw into the
    // booking flow."
    await prisma.ttlockFallbackLog
      .create({
        data: {
          bookingId: params.bookingId,
          unitId: params.unitId,
          guestId: params.guestId,
          errorMessage: `Unexpected error in createGuestAccessCode: ${e instanceof Error ? e.message : String(e)}`,
        },
      })
      .catch(() => {});
  }
}

async function assignReserveCode(params: AccessCodeParams, fallbackReason: string): Promise<void> {
  let claimed: { id: string; code: string } | null = null;

  // Loops only to survive a genuine simultaneous-booking race on the same
  // unit (rare at this app's real scale — 5 units, a handful of bookings a
  // day). Each iteration's updateMany is the atomic compare-and-swap: its
  // WHERE clause re-checks status = AVAILABLE at write time, so if two
  // requests race for the same row only one's update actually matches and
  // takes it — the loser sees count 0 and just tries the next candidate.
  for (let i = 0; i < 5 && !claimed; i++) {
    const candidate = await prisma.reserveAccessCode.findFirst({
      where: { unitId: params.unitId, status: "AVAILABLE" },
      orderBy: { code: "asc" },
    });
    if (!candidate) break;
    const result = await prisma.reserveAccessCode.updateMany({
      where: { id: candidate.id, status: "AVAILABLE" },
      data: { status: "RESERVED", bookingId: params.bookingId, guestId: params.guestId, assignedAt: new Date(), fallbackReason },
    });
    if (result.count > 0) claimed = candidate;
  }

  await prisma.ttlockFallbackLog.create({
    data: {
      bookingId: params.bookingId,
      unitId: params.unitId,
      guestId: params.guestId,
      errorMessage: claimed ? fallbackReason : `${fallbackReason} — no reserve codes available for this unit`,
      reserveCodeId: claimed?.id ?? null,
    },
  });

  if (!claimed) return; // booking proceeds with no access code; logged above for staff follow-up

  const updated = await prisma.booking.updateMany({
    where: { id: params.bookingId, accessCode: null },
    data: { accessCode: claimed.code, accessCodeSource: "reserve", accessCodeAssignedAt: new Date() },
  });
  if (updated.count === 0) {
    // Lost a race — a concurrent call already set a different code on this
    // booking first. Release the reserve code we grabbed back to the pool
    // instead of leaking it as permanently RESERVED to nothing.
    await prisma.reserveAccessCode.update({
      where: { id: claimed.id },
      data: { status: "AVAILABLE", bookingId: null, guestId: null, releasedAt: new Date(), fallbackReason: null },
    });
  }
}

/** Releases a booking's access code on checkout — a "reserve" code goes
 * back to AVAILABLE for reuse by a future guest; a real "ttlock" code gets
 * deleted from the lock (best-effort; a failed delete just leaves a
 * harmless stale code that's already past its endDate anyway). Safe to
 * call on a booking with no code assigned (no-ops). */
export async function releaseAccessCodeForBooking(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { accessCode: true, accessCodeSource: true, accessCodeKeyboardPwdId: true, unitId: true },
  });
  if (!booking?.accessCode) return;

  if (booking.accessCodeSource === "reserve") {
    await prisma.reserveAccessCode.updateMany({
      where: { bookingId },
      data: { status: "AVAILABLE", bookingId: null, guestId: null, releasedAt: new Date(), fallbackReason: null },
    });
  } else if (booking.accessCodeSource === "ttlock" && booking.accessCodeKeyboardPwdId) {
    const unit = await prisma.unit.findUnique({ where: { id: booking.unitId }, select: { ttlockLockId: true } });
    if (unit?.ttlockLockId) {
      await deleteTtlockPasscode(unit.ttlockLockId, booking.accessCodeKeyboardPwdId).catch(() => {});
    }
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { accessCode: null, accessCodeSource: null, accessCodeKeyboardPwdId: null, accessCodeAssignedAt: null },
  });
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
    // transient failure provisioning back-to-back locks in the same run
    // (a short burst of TTLock API calls in quick succession); a bare
    // single-shot call isn't reliable enough even for this one-time setup.
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
