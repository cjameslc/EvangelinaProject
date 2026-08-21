import { describe, expect, it } from "vitest";
import { tierForUnitRevenue, computePortfolioTargetLadder, computeLadderGaps, DEFAULT_TARGET_TIERS } from "./targetTiers";

describe("tierForUnitRevenue", () => {
  it("classifies each real band boundary correctly", () => {
    expect(tierForUnitRevenue(0).band).toBe("underperforming");
    expect(tierForUnitRevenue(29999).band).toBe("underperforming");
    expect(tierForUnitRevenue(30000).band).toBe("underperforming"); // 30K is still below the 35K baseline floor
    expect(tierForUnitRevenue(35000).band).toBe("baseline");
    expect(tierForUnitRevenue(39999).band).toBe("baseline");
    expect(tierForUnitRevenue(40000).band).toBe("good");
    expect(tierForUnitRevenue(44999).band).toBe("good");
    expect(tierForUnitRevenue(45000).band).toBe("strong");
    expect(tierForUnitRevenue(49999).band).toBe("strong");
    expect(tierForUnitRevenue(50000).band).toBe("exceptional");
    expect(tierForUnitRevenue(100000).band).toBe("exceptional");
  });

  it("respects a custom tier table instead of the hardcoded default", () => {
    const customTiers = { ...DEFAULT_TARGET_TIERS, baseline: { ...DEFAULT_TARGET_TIERS.baseline, perUnitPesos: 20000 } };
    expect(tierForUnitRevenue(20000, customTiers).band).toBe("baseline");
    expect(tierForUnitRevenue(20000, DEFAULT_TARGET_TIERS).band).toBe("underperforming");
  });
});

describe("computePortfolioTargetLadder", () => {
  it("scales automatically with real unit count — never a hardcoded portfolio figure", () => {
    const ladder5 = computePortfolioTargetLadder(5);
    expect(ladder5.baselinePesos).toBe(175000);
    expect(ladder5.goodPesos).toBe(200000);
    expect(ladder5.strongPesos).toBe(225000);
    expect(ladder5.stretchPesos).toBe(250000);

    const ladder6 = computePortfolioTargetLadder(6);
    expect(ladder6.baselinePesos).toBe(210000);
    expect(ladder6.goodPesos).toBe(240000);
    expect(ladder6.strongPesos).toBe(270000);
    expect(ladder6.stretchPesos).toBe(300000);
  });

  it("handles zero units without dividing by zero anywhere downstream", () => {
    const ladder = computePortfolioTargetLadder(0);
    expect(ladder.baselinePesos).toBe(0);
  });
});

describe("computeLadderGaps", () => {
  it("reports negative gaps once a rung is cleared, positive gaps for rungs not yet reached", () => {
    const ladder = computePortfolioTargetLadder(5); // baseline 175K, good 200K, strong 225K, stretch 250K
    const gaps = computeLadderGaps(170286, ladder); // real figure from this session's own live-verified data
    expect(gaps.toBaselinePesos).toBeGreaterThan(0); // just short of baseline
    expect(gaps.toGoodPesos).toBeGreaterThan(gaps.toBaselinePesos);
    expect(gaps.toStretchPesos).toBeGreaterThan(gaps.toGoodPesos);
  });

  it("derives currentBand from the real per-unit average, not the raw portfolio total", () => {
    const ladder = computePortfolioTargetLadder(5);
    const gaps = computeLadderGaps(175000, ladder); // exactly baseline portfolio-wide = 35K/unit
    expect(gaps.currentBand).toBe("baseline");
    expect(gaps.toBaselinePesos).toBe(0);
  });
});
