// The authorization decision engine — "TTLock accepted the code" and
// "our application authorized this access" are two different questions;
// this is the only place that answers the second one. Pure function, no
// I/O, so it can be tested against real captured TTLock records without
// needing a live lock, a live database, or a live booking.

export type Classification =
  | "AUTHORIZED"
  | "TRUSTED"
  | "UNAUTHORIZED"
  | "EXPIRED"
  | "REVOKED"
  | "WRONG_UNIT"
  | "OUTSIDE_ALLOWED_TIME"
  | "UNABLE_TO_VERIFY";

export type Severity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type MatchedCredential = {
  unitId: string;
  status: string; // PENDING | ACTIVE | EXPIRED | REVOKED | FAILED
  validFrom: Date | null;
  validUntil: Date | null;
  revokedAt: Date | null;
  bookingId: string | null;
  type: string; // GUEST | OWNER_ADMIN_EMERGENCY | HOUSEKEEPING
};

export type ClassifyResult = { classification: Classification; severity: Severity; reason: string };

/**
 * `matchedCredential` is whatever this app's own AccessCredential table
 * says about the passcode TTLock reports for this event — or null if no
 * credential anywhere (active, expired, or revoked) has ever had that
 * code. `trustedUsernames` is the Owner-configurable allowlist
 * (Settings.trustedTtlockUsernames) for TTLock's own account-holder/
 * master-key access, which is real, legitimate, and — confirmed against
 * this account's actual access history — has no booking behind it by
 * design, so it must never be treated as "no association found."
 */
export function classifyAccessEvent(params: {
  success: boolean;
  occurredAt: Date;
  eventUnitId: string | null;
  matchedCredential: MatchedCredential | null;
  ttlockUsername: string | null;
  trustedUsernames: string[];
}): ClassifyResult {
  const { success, occurredAt, eventUnitId, matchedCredential, ttlockUsername, trustedUsernames } = params;

  // A failed attempt is real signal (someone tried a code the lock
  // rejected) regardless of whether it happens to also be a trusted name
  // — TTLock reports the attempted username even on failure, but a
  // rejected attempt is never "trusted," successful access.
  if (!success) {
    return {
      classification: "UNAUTHORIZED",
      severity: "MEDIUM",
      reason: "A code was entered on the lock and rejected — wrong or unrecognized passcode.",
    };
  }

  if (ttlockUsername && trustedUsernames.some((t) => t.toLowerCase() === ttlockUsername.toLowerCase())) {
    return {
      classification: "TRUSTED",
      severity: "NONE",
      reason: `Recognized trusted access ("${ttlockUsername}") — allow-listed in Settings, not expected to have a booking behind it.`,
    };
  }

  if (eventUnitId === null) {
    // The lock itself isn't mapped to a unit in this app at all — can't
    // even ask "which unit's bookings should this correlate against."
    return {
      classification: "UNABLE_TO_VERIFY",
      severity: "LOW",
      reason: "This lock isn't currently mapped to a unit in the app, so authorization can't be checked.",
    };
  }

  if (!matchedCredential) {
    return {
      classification: "UNAUTHORIZED",
      severity: "CRITICAL",
      reason: "This code doesn't match any booking, staff, or approved access credential this app has ever issued.",
    };
  }

  if (matchedCredential.unitId !== eventUnitId) {
    return {
      classification: "WRONG_UNIT",
      severity: "HIGH",
      reason: "The matching credential was issued for a different unit than where this access occurred.",
    };
  }

  // Timestamp-first, deliberately never keyed off the credential's CURRENT
  // status alone — status reflects where the credential stands right now,
  // not whether it was valid at the moment this specific historical event
  // happened. A cleaner unlocking a door at 11:46pm with a credential that
  // isn't revoked until 12:19am the same night was legitimately authorized
  // at 11:46pm; checking status === "REVOKED" without this comparison
  // flagged that exact real access as unauthorized — confirmed live
  // against this account's actual housekeeping credentials before this
  // fix, not a hypothetical.
  if (matchedCredential.revokedAt && occurredAt.getTime() >= matchedCredential.revokedAt.getTime()) {
    return { classification: "REVOKED", severity: "HIGH", reason: "This credential had already been revoked at the time of this access." };
  }

  if (matchedCredential.status === "FAILED") {
    return { classification: "EXPIRED", severity: "HIGH", reason: "This credential's generation never fully succeeded, so it should never have been usable." };
  }

  if (matchedCredential.validFrom && occurredAt.getTime() < matchedCredential.validFrom.getTime()) {
    return { classification: "OUTSIDE_ALLOWED_TIME", severity: "MEDIUM", reason: "Access occurred before this credential's authorized window began." };
  }
  if (matchedCredential.validUntil && occurredAt.getTime() > matchedCredential.validUntil.getTime()) {
    return {
      classification: "EXPIRED",
      severity: "HIGH",
      reason: "Access occurred after this credential's authorized window ended.",
    };
  }

  return {
    classification: "AUTHORIZED",
    severity: "NONE",
    reason: matchedCredential.bookingId
      ? "Matches an active guest booking's own credential."
      : `Matches an active ${matchedCredential.type.replace(/_/g, " ").toLowerCase()} credential.`,
  };
}

/** Never store or display a working passcode — the last 2 characters are
 * still useful for a human cross-checking "is this the code I just gave
 * the guest" without this table ever holding something someone could use
 * to walk in. */
export function maskPasscode(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code.length <= 2) return "•".repeat(code.length);
  return "•".repeat(code.length - 2) + code.slice(-2);
}
