import { describe, it, expect } from "vitest";
import { classifyAccessEvent, maskPasscode } from "./eventClassifier";

const baseCredential = {
  unitId: "unit-1",
  status: "ACTIVE",
  validFrom: new Date("2026-08-08T23:45:00Z"),
  validUntil: new Date("2026-08-09T01:45:00Z"),
  revokedAt: null as Date | null,
  bookingId: null,
  type: "HOUSEKEEPING",
};

describe("classifyAccessEvent — revoked-credential timing (real confirmed bug)", () => {
  // Real scenario captured live: a housekeeping credential created
  // 2026-08-08T23:45:31Z, used at 23:46:04Z and 00:18:10Z, then revoked at
  // 00:19:11Z (the cleaner marking the job complete). Both real accesses
  // happened *before* revocation — checking credential.status alone
  // (REVOKED, its current state) instead of comparing occurredAt against
  // revokedAt misclassified genuinely authorized cleaning access as a
  // security incident.
  it("access before revokedAt is AUTHORIZED, not REVOKED", () => {
    const result = classifyAccessEvent({
      success: true,
      occurredAt: new Date("2026-08-08T23:46:04Z"),
      eventUnitId: "unit-1",
      matchedCredential: { ...baseCredential, status: "REVOKED", revokedAt: new Date("2026-08-09T00:19:11Z") },
      ttlockUsername: "Clean-abc123",
      trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("AUTHORIZED");
  });

  it("access at or after revokedAt is REVOKED", () => {
    const result = classifyAccessEvent({
      success: true,
      occurredAt: new Date("2026-08-09T00:25:00Z"),
      eventUnitId: "unit-1",
      matchedCredential: { ...baseCredential, status: "REVOKED", revokedAt: new Date("2026-08-09T00:19:11Z") },
      ttlockUsername: "Clean-abc123",
      trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("REVOKED");
  });
});

describe("classifyAccessEvent — core classifications", () => {
  it("no matching credential -> UNAUTHORIZED/CRITICAL", () => {
    const result = classifyAccessEvent({
      success: true, occurredAt: new Date(), eventUnitId: "unit-1",
      matchedCredential: null, ttlockUsername: "Guest 2045", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("UNAUTHORIZED");
    expect(result.severity).toBe("CRITICAL");
  });

  it("failed unlock attempt -> UNAUTHORIZED/MEDIUM, regardless of credential match", () => {
    const result = classifyAccessEvent({
      success: false, occurredAt: new Date(), eventUnitId: "unit-1",
      matchedCredential: null, ttlockUsername: "88***", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("UNAUTHORIZED");
    expect(result.severity).toBe("MEDIUM");
  });

  it("trusted username with no credential -> TRUSTED, not flagged", () => {
    const result = classifyAccessEvent({
      success: true, occurredAt: new Date(), eventUnitId: "unit-1",
      matchedCredential: null, ttlockUsername: "Admin", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("TRUSTED");
    expect(result.severity).toBe("NONE");
  });

  it("failed attempt from a trusted username is still flagged, not silently trusted", () => {
    const result = classifyAccessEvent({
      success: false, occurredAt: new Date(), eventUnitId: "unit-1",
      matchedCredential: null, ttlockUsername: "Admin", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("UNAUTHORIZED");
  });

  it("credential for a different unit -> WRONG_UNIT", () => {
    const result = classifyAccessEvent({
      success: true, occurredAt: new Date("2026-08-08T23:46:00Z"), eventUnitId: "unit-2",
      matchedCredential: baseCredential, ttlockUsername: "Guest", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("WRONG_UNIT");
  });

  it("access before validFrom -> OUTSIDE_ALLOWED_TIME", () => {
    const result = classifyAccessEvent({
      success: true, occurredAt: new Date("2026-08-08T20:00:00Z"), eventUnitId: "unit-1",
      matchedCredential: baseCredential, ttlockUsername: "Guest", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("OUTSIDE_ALLOWED_TIME");
  });

  it("access after validUntil -> EXPIRED", () => {
    const result = classifyAccessEvent({
      success: true, occurredAt: new Date("2026-08-09T05:00:00Z"), eventUnitId: "unit-1",
      matchedCredential: baseCredential, ttlockUsername: "Guest", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("EXPIRED");
  });

  it("valid, active, in-window credential -> AUTHORIZED", () => {
    const result = classifyAccessEvent({
      success: true, occurredAt: new Date("2026-08-09T00:00:00Z"), eventUnitId: "unit-1",
      matchedCredential: baseCredential, ttlockUsername: "Guest", trustedUsernames: ["Admin"],
    });
    expect(result.classification).toBe("AUTHORIZED");
  });
});

describe("maskPasscode — never expose a working code", () => {
  it("keeps only the last 2 characters", () => {
    expect(maskPasscode("630524")).toBe("••••24");
  });
  it("handles short codes safely", () => {
    expect(maskPasscode("12")).toBe("••");
  });
  it("null/undefined passes through as null", () => {
    expect(maskPasscode(null)).toBeNull();
    expect(maskPasscode(undefined)).toBeNull();
  });
});
