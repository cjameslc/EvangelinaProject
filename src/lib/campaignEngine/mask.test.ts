import { describe, expect, it } from "vitest";
import { maskPeso, maskedBandFloor, renderMoney, toWireRanked, toWireTeamBattleSide } from "./mask";
import { rankParticipants } from "./campaign";
import { computeBookerTotals } from "./profit";
import type { CampaignBooking, CampaignParticipantInput, TeamBattleSide } from "./types";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
function booking(overrides: Partial<CampaignBooking>): CampaignBooking {
  return { bookerId: null, date: day("2026-08-01"), amount: 0, paid: true, dpAmount: null, refundedAt: null, ...overrides };
}

const mark: CampaignParticipantInput = { employeeId: "mark", name: "Mark", role: "BOOKER", side: "A", avatarColor: "#111", avatarUrl: null };
const riemar: CampaignParticipantInput = { employeeId: "riemar", name: "Riemar", role: "BOOKER", side: "B", avatarColor: "#222", avatarUrl: null };
const earl: CampaignParticipantInput = { employeeId: "earl", name: "Earl", role: "BOOKER", side: "A", avatarColor: "#333", avatarUrl: null };

describe("maskPeso — the brief's own worked examples", () => {
  it("87,450 -> ₱8X,XXX+ (matches the brief's exact example)", () => {
    expect(maskPeso(87450)).toBe("₱8X,XXX+");
  });
  it("65,230 -> ₱6X,XXX+ (matches the brief's exact example)", () => {
    expect(maskPeso(65230)).toBe("₱6X,XXX+");
  });
  it("never reveals more than the leading digit, regardless of magnitude", () => {
    expect(maskPeso(4200)).toBe("₱4,XXX+");
    expect(maskPeso(999999)).toBe("₱9XX,XXX+");
    expect(maskPeso(0)).toBe("₱0");
  });
  it("always contains at least one masked digit (X) for any multi-digit amount — proves it's genuinely obscured, not just reformatted", () => {
    expect(maskPeso(87450)).toContain("X");
    expect(maskPeso(4200)).toContain("X");
    expect(Number.isNaN(Number(maskPeso(87450).replace(/[₱,+]/g, "")))).toBe(true); // not parseable back into a real number
  });
});

describe("maskedBandFloor", () => {
  it("floors to the same band maskPeso's leading digit implies", () => {
    expect(maskedBandFloor(87450)).toBe(80000);
    expect(maskedBandFloor(65230)).toBe(60000);
    expect(maskedBandFloor(4200)).toBe(4000);
  });
});

describe("toWireRanked — the core exact-value gate", () => {
  const participants = [mark, riemar, earl];
  function ranked() {
    const totals = computeBookerTotals(
      [booking({ bookerId: "mark", amount: 87450 }), booking({ bookerId: "riemar", amount: 65230 }), booking({ bookerId: "earl", amount: 12000 })],
      ["mark", "riemar", "earl"]
    );
    return rankParticipants(participants, totals, null);
  }

  it("admin sees every real number, untouched", () => {
    const wire = toWireRanked(ranked(), true, null);
    expect(wire.find((p) => p.employeeId === "mark")!.profitPesos).toBe(87450);
    expect(wire.find((p) => p.employeeId === "riemar")!.profitPesos).toBe(65230);
  });

  it("a non-admin viewer sees their OWN row's real number — not new information, they made those bookings", () => {
    const wire = toWireRanked(ranked(), false, "mark");
    expect(wire.find((p) => p.employeeId === "mark")!.profitPesos).toBe(87450);
  });

  it("a non-admin viewer never receives another participant's real number — only the masked teaser string", () => {
    const wire = toWireRanked(ranked(), false, "mark");
    const riemarRow = wire.find((p) => p.employeeId === "riemar")!;
    expect(typeof riemarRow.profitPesos).toBe("string");
    expect(riemarRow.profitPesos).toBe("₱6X,XXX+");
    expect(riemarRow.revenuePesos).not.toBe(65230);
  });

  it("a viewer with no employee record (e.g. an admin-role account with no booking record) gets every row masked", () => {
    const wire = toWireRanked(ranked(), false, null);
    expect(wire.every((p) => typeof p.profitPesos === "string")).toBe(true);
  });

  it("bar fill for a masked row is derived from the masked band, not the real value — same precision as the text next to it", () => {
    const wire = toWireRanked(ranked(), false, "earl"); // viewer is the lowest earner, everyone else masked
    const markRow = wire.find((p) => p.employeeId === "mark")!; // real 87,450, masked band floor 80,000
    // Leader (mark) should be 100 since maxEffective is mark's own masked band floor.
    expect(markRow.barPct).toBe(100);
    const riemarRow = wire.find((p) => p.employeeId === "riemar")!; // real 65,230, masked band floor 60,000
    expect(riemarRow.barPct).toBe(Math.round((60000 / 80000) * 100)); // 75, not the real 65230/87450=~74.6 ratio
  });

  it("rank, bookingCount, name, and side are never masked — only the money fields", () => {
    const wire = toWireRanked(ranked(), false, "earl");
    const mark_ = wire.find((p) => p.employeeId === "mark")!;
    expect(mark_.rank).toBe(1);
    expect(mark_.name).toBe("Mark");
    expect(mark_.side).toBe("A");
    expect(mark_.bookingCount).toBe(1);
  });
});

describe("toWireTeamBattleSide", () => {
  const battleSide: TeamBattleSide = {
    side: "A",
    members: [],
    totalProfitPesos: 102950,
    totalRevenuePesos: 134624,
    totalBookings: 77,
    avgProfitPerBooker: 34317,
    avgProfitPerBooking: 1337,
    contributionPct: 41, // 102950 / 250000 * 100, rounded
  };

  it("admin sees the real side total and the real contribution percent", () => {
    const wire = toWireTeamBattleSide(battleSide, true, null, 250000);
    expect(wire.totalProfitPesos).toBe(102950);
    expect(wire.contributionPct).toBe(41);
  });

  it("non-admin never receives the real side total", () => {
    const wire = toWireTeamBattleSide(battleSide, false, null, 250000);
    expect(wire.totalProfitPesos).toBe("₱1XX,XXX+");
  });

  it("non-admin's contributionPct is recomputed from the masked band, not the real total — a viewer who knows the public target must not be able to back-solve the exact side total from an exact percent", () => {
    const wire = toWireTeamBattleSide(battleSide, false, null, 250000);
    // Real: 102950 -> masked band floor 100000. 100000/250000*100 = 40, not the real 41.
    expect(wire.contributionPct).toBe(40);
    expect(wire.contributionPct).not.toBe(battleSide.contributionPct);
  });
});

describe("renderMoney", () => {
  it("formats a real number as pesos", () => {
    expect(renderMoney(87450)).toBe("₱87,450");
  });
  it("passes a pre-formatted masked string through unchanged", () => {
    expect(renderMoney("₱8X,XXX+")).toBe("₱8X,XXX+");
  });
});
