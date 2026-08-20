import { describe, expect, it } from "vitest";
import {
  computeDailyRankSeries, computeDailySeries, computeMilestones, computeTeamBattle, computeWinner,
  deriveAchievements, motivationForViewer, motivationForViewerMasked, rankParticipants,
} from "./campaign";
import { computeBookerTotals } from "./profit";
import type { CampaignBooking, CampaignParticipantInput } from "./types";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function booking(overrides: Partial<CampaignBooking>): CampaignBooking {
  return { bookerId: null, date: day("2026-09-01"), amount: 0, paid: true, dpAmount: null, refundedAt: null, ...overrides };
}

const mark: CampaignParticipantInput = { employeeId: "mark", name: "Mark", role: "BOOKER", side: "A", avatarColor: "#111", avatarUrl: null };
const riemar: CampaignParticipantInput = { employeeId: "riemar", name: "Riemar", role: "BOOKER", side: "B", avatarColor: "#222", avatarUrl: null };
const earl: CampaignParticipantInput = { employeeId: "earl", name: "Earl", role: "BOOKER", side: "A", avatarColor: "#333", avatarUrl: null };
const participants = [mark, riemar, earl];

describe("computeBookerTotals", () => {
  it("ranks by collected amount (paid + dp), never by raw booking count", () => {
    const bookings: CampaignBooking[] = [
      booking({ bookerId: "mark", amount: 5000, paid: true }),
      booking({ bookerId: "mark", amount: 5000, paid: true }),
      booking({ bookerId: "mark", amount: 5000, paid: true }),
      booking({ bookerId: "riemar", amount: 30000, paid: true }),
    ];
    const totals = computeBookerTotals(bookings, ["mark", "riemar"]);
    expect(totals.get("mark")!.profitPesos).toBe(15000);
    expect(totals.get("mark")!.bookingCount).toBe(3);
    expect(totals.get("riemar")!.profitPesos).toBe(30000);
    // Riemar has fewer bookings but more profit — profit is what should win a rank comparison.
    expect(totals.get("riemar")!.profitPesos).toBeGreaterThan(totals.get("mark")!.profitPesos);
  });

  it("zeroes a refunded booking's profit even though it was paid", () => {
    const bookings: CampaignBooking[] = [booking({ bookerId: "mark", amount: 10000, paid: true, refundedAt: day("2026-09-05") })];
    const totals = computeBookerTotals(bookings, ["mark"]);
    expect(totals.get("mark")!.profitPesos).toBe(0);
  });

  it("still counts a kept deposit on an unpaid (cancelled) booking — no cancelledAt filter applied here", () => {
    const bookings: CampaignBooking[] = [booking({ bookerId: "mark", amount: 5000, paid: false, dpAmount: 500 })];
    const totals = computeBookerTotals(bookings, ["mark"]);
    expect(totals.get("mark")!.profitPesos).toBe(500);
  });

  it("ignores bookings whose bookerId isn't a campaign participant", () => {
    const bookings: CampaignBooking[] = [booking({ bookerId: "someone-else", amount: 99999, paid: true })];
    const totals = computeBookerTotals(bookings, ["mark"]);
    expect(totals.get("mark")!.profitPesos).toBe(0);
  });
});

describe("rankParticipants", () => {
  it("orders strictly by profitPesos, not bookingCount or name", () => {
    const totals = computeBookerTotals(
      [booking({ bookerId: "mark", amount: 10000 }), booking({ bookerId: "riemar", amount: 20000 }), booking({ bookerId: "earl", amount: 5000 })],
      ["mark", "riemar", "earl"]
    );
    const ranked = rankParticipants(participants, totals, null);
    expect(ranked.map((r) => r.employeeId)).toEqual(["riemar", "mark", "earl"]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it("computes a month-over-month trend percentage against previous final profit", () => {
    const totals = computeBookerTotals([booking({ bookerId: "mark", amount: 12000 })], ["mark", "riemar", "earl"]);
    const ranked = rankParticipants(participants, totals, new Map([["mark", 10000]]));
    const markRow = ranked.find((r) => r.employeeId === "mark")!;
    expect(markRow.trendPct).toBe(20); // (12000-10000)/10000 = 20%
  });

  it("leaves trend null when there's no previous campaign to compare against", () => {
    const totals = computeBookerTotals([booking({ bookerId: "mark", amount: 1000 })], ["mark"]);
    const ranked = rankParticipants([mark], totals, null);
    expect(ranked[0].trendPct).toBeNull();
  });
});

describe("computeMilestones", () => {
  it("scales the 5 milestone thresholds proportionally to whatever target is configured", () => {
    const milestones = computeMilestones(100_000, 0);
    expect(milestones.map((m) => m.pesos)).toEqual([20_000, 40_000, 60_000, 80_000, 100_000]);
  });

  it("marks only milestones at or below the current total as unlocked", () => {
    const milestones = computeMilestones(250_000, 130_000);
    expect(milestones.map((m) => m.unlocked)).toEqual([true, true, false, false, false]); // 50K, 100K unlocked; 150K+ not
  });
});

describe("computeTeamBattle", () => {
  it("sums each side's totals and correctly identifies the leading side", () => {
    const totals = computeBookerTotals(
      [booking({ bookerId: "mark", amount: 60000 }), booking({ bookerId: "earl", amount: 40000 }), booking({ bookerId: "riemar", amount: 50000 })],
      ["mark", "earl", "riemar"]
    );
    const ranked = rankParticipants(participants, totals, null);
    const battle = computeTeamBattle(ranked, 250_000)!;
    expect(battle.A.totalProfitPesos).toBe(100_000); // mark + earl
    expect(battle.B.totalProfitPesos).toBe(50_000); // riemar
    expect(battle.leadingSide).toBe("A");
    expect(battle.A.avgProfitPerBooker).toBe(50_000);
  });

  it("returns null when fewer than 2 sides are configured (nothing to battle yet)", () => {
    const totals = computeBookerTotals([], ["mark"]);
    const ranked = rankParticipants([mark], totals, null);
    expect(computeTeamBattle(ranked, 250_000)).toBeNull();
  });
});

describe("motivationForViewer", () => {
  const totals = computeBookerTotals(
    [booking({ bookerId: "riemar", amount: 50000 }), booking({ bookerId: "mark", amount: 40000 }), booking({ bookerId: "earl", amount: 10000 })],
    ["mark", "riemar", "earl"]
  );
  const ranked = rankParticipants(participants, totals, null);

  it("tells the #1 booker they're leading", () => {
    expect(motivationForViewer(ranked, "riemar")).toMatch(/leading/i);
  });

  it("tells #2 exactly how far behind #1 they are", () => {
    expect(motivationForViewer(ranked, "mark")).toContain("₱10,000");
  });

  it("tells last place to keep pushing rather than naming a specific gap", () => {
    expect(motivationForViewer(ranked, "earl")).toMatch(/keep pushing/i);
  });

  it("returns null for a non-participant viewer", () => {
    expect(motivationForViewer(ranked, "not-a-participant")).toBeNull();
  });
});

describe("computeWinner", () => {
  const totals = computeBookerTotals([booking({ bookerId: "riemar", amount: 300000 })], ["mark", "riemar", "earl"]);
  const ranked = rankParticipants(participants, totals, null);

  it("names the top-ranked participant only once target is achieved", () => {
    expect(computeWinner(ranked, true)?.employeeId).toBe("riemar");
  });

  it("names no winner while target is still unmet — competition stays open", () => {
    expect(computeWinner(ranked, false)).toBeNull();
  });
});

describe("computeDailySeries", () => {
  it("accumulates cumulative profit per employee day by day, never counting a booking before its own date", () => {
    const bookings: CampaignBooking[] = [
      booking({ bookerId: "mark", date: day("2026-09-01"), amount: 1000 }),
      booking({ bookerId: "mark", date: day("2026-09-03"), amount: 2000 }),
    ];
    const series = computeDailySeries(bookings, day("2026-09-01"), day("2026-09-06"), ["mark"], day("2026-09-05"));
    const byDate = Object.fromEntries(series.map((p) => [p.dateIso, p.byEmployee.mark]));
    expect(byDate["2026-09-01"]).toBe(1000);
    expect(byDate["2026-09-02"]).toBe(1000); // no new booking yet
    expect(byDate["2026-09-03"]).toBe(3000); // cumulative
  });

  it("never projects days past today for an in-progress campaign", () => {
    const series = computeDailySeries([], day("2026-09-01"), day("2026-10-01"), ["mark"], day("2026-09-10"));
    expect(series[series.length - 1].dateIso).toBe("2026-09-10");
  });
});

describe("deriveAchievements", () => {
  it("emits a milestone-unlock achievement the day the total first crosses each threshold", () => {
    const bookings: CampaignBooking[] = [booking({ bookerId: "mark", date: day("2026-09-05"), amount: 50_000 })];
    const series = computeDailySeries(bookings, day("2026-09-01"), day("2026-09-10"), ["mark"], day("2026-09-08"));
    const achievements = deriveAchievements(series, [mark], 250_000, "September", true);
    expect(achievements.some((a) => a.message.includes("20%"))).toBe(true);
  });

  it("emits a #1 rank-change achievement only on a genuine lead change, not on the very first day someone has any profit", () => {
    const bookings: CampaignBooking[] = [
      booking({ bookerId: "mark", date: day("2026-09-01"), amount: 10_000 }),
      booking({ bookerId: "riemar", date: day("2026-09-03"), amount: 20_000 }),
    ];
    const series = computeDailySeries(bookings, day("2026-09-01"), day("2026-09-10"), ["mark", "riemar"], day("2026-09-05"));
    const achievements = deriveAchievements(series, [mark, riemar], 250_000, "September", true);
    expect(achievements.some((a) => a.message.includes("Riemar moved into #1"))).toBe(true);
    expect(achievements.some((a) => a.message.includes("Mark moved into #1"))).toBe(false);
  });

  it("never names a side's exact peso amount when includeAmounts is false — a 2-3 person side total is real info about specific people, same reveal risk as an individual amount", () => {
    const bookings: CampaignBooking[] = [booking({ bookerId: "mark", date: day("2026-09-05"), amount: 50_000 })];
    const series = computeDailySeries(bookings, day("2026-09-01"), day("2026-09-10"), ["mark"], day("2026-09-08"));
    const achievements = deriveAchievements(series, [mark], 250_000, "September", false);
    const sideAchievement = achievements.find((a) => a.message.includes("Group"));
    expect(sideAchievement).toBeDefined();
    expect(sideAchievement!.message).not.toMatch(/₱[\d,]/);
  });

  it("still names the overall campaign-wide target milestone amount regardless of includeAmounts — that figure is the public shared goal, not one side's or one person's number", () => {
    const bookings: CampaignBooking[] = [booking({ bookerId: "mark", date: day("2026-09-05"), amount: 50_000 })];
    const series = computeDailySeries(bookings, day("2026-09-01"), day("2026-09-10"), ["mark"], day("2026-09-08"));
    const achievements = deriveAchievements(series, [mark], 250_000, "September", false);
    expect(achievements.some((a) => a.message.includes("September reached 20% of target (₱50,000)"))).toBe(true);
  });
});

describe("motivationForViewerMasked", () => {
  const totals = computeBookerTotals(
    [booking({ bookerId: "riemar", amount: 50000 }), booking({ bookerId: "mark", amount: 47500 }), booking({ bookerId: "earl", amount: 10000 })],
    ["mark", "riemar", "earl"]
  );
  const ranked = rankParticipants(participants, totals, null);

  it("never includes a peso figure in any tier, unlike the admin version", () => {
    for (const viewerId of ["mark", "riemar", "earl"]) {
      const msg = motivationForViewerMasked(ranked, viewerId);
      expect(msg).not.toMatch(/₱[\d,]/);
    }
  });

  it("tells #1 they're leading, without naming the runner-up's gap", () => {
    expect(motivationForViewerMasked(ranked, "riemar")).toMatch(/Leader/i);
  });

  it("picks a closer tier for a small gap than for a large one, without ever stating the ratio itself", () => {
    // mark is very close to riemar (47500 vs 50000, ~5% gap) -> neck-and-neck tier
    expect(motivationForViewerMasked(ranked, "mark")).toMatch(/neck-and-neck/i);
  });

  it("returns null for a non-participant, same contract as the admin version", () => {
    expect(motivationForViewerMasked(ranked, "nobody")).toBeNull();
  });
});

describe("computeDailyRankSeries", () => {
  it("converts a dollar-value daily series into a same-shape rank series, with no peso figures anywhere", () => {
    const bookings: CampaignBooking[] = [
      booking({ bookerId: "mark", date: day("2026-09-01"), amount: 10_000 }),
      booking({ bookerId: "riemar", date: day("2026-09-03"), amount: 30_000 }),
    ];
    const series = computeDailySeries(bookings, day("2026-09-01"), day("2026-09-05"), ["mark", "riemar"], day("2026-09-04"));
    const rankSeries = computeDailyRankSeries(series, ["mark", "riemar"]);
    // Day 1: only mark has booked -> mark is #1.
    const day1 = rankSeries.find((p) => p.dateIso === "2026-09-01")!;
    expect(day1.byEmployee.mark).toBe(1);
    expect(day1.byEmployee.riemar).toBe(2);
    // Day 3+: riemar has overtaken -> riemar is #1.
    const day3 = rankSeries.find((p) => p.dateIso === "2026-09-03")!;
    expect(day3.byEmployee.riemar).toBe(1);
    expect(day3.byEmployee.mark).toBe(2);
  });

  it("breaks ties deterministically by employeeId, not by insertion order", () => {
    const series = [{ dateIso: "2026-09-01", totalProfitPesos: 0, byEmployee: { zed: 0, abe: 0 } }];
    const rankSeries = computeDailyRankSeries(series, ["zed", "abe"]);
    expect(rankSeries[0].byEmployee.abe).toBe(1); // alphabetically first wins the tie
    expect(rankSeries[0].byEmployee.zed).toBe(2);
  });
});
