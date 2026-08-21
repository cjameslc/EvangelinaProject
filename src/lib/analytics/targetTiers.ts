// Tiered per-unit revenue performance model — replaces the old binary
// "did you hit ₱50,000/unit, yes or no" framing with a 5-band scale, so a
// unit at ₱35K reads as "commercially acceptable," not "failing." This is
// a DIFFERENT axis from computeUnitGoal's own `status` field
// (revenueGoals.ts) — `status` answers "are we pacing well against
// whatever the target is, given days remaining in the month" (ahead/on_
// track/behind/at_risk); `tier` answers "which real performance band does
// this month's revenue currently sit in." Both are shown together, never
// one replacing the other.
//
// Deliberately configurable, not hardcoded into any UI component — every
// value here is a named constant a caller can override, and the portfolio
// ladder is derived from the REAL unit count passed in, so it recalculates
// correctly whether the portfolio has 5, 6, or 11 units, with no redesign
// needed anywhere downstream.

export type TargetTierBand = "underperforming" | "baseline" | "good" | "strong" | "exceptional";

export type TargetTierDefinition = { band: TargetTierBand; emoji: string; label: string; perUnitPesos: number };

/** Default per-unit thresholds (pesos/month) — the floor of each band.
 * underperforming has no floor (it's "below baseline's floor"); its own
 * threshold field marks the boundary below which a unit is flagged, not a
 * tier a unit can be "in" the way the other four are. */
export const DEFAULT_TARGET_TIERS: Record<TargetTierBand, TargetTierDefinition> = {
  underperforming: { band: "underperforming", emoji: "🔴", label: "Underperforming", perUnitPesos: 30000 },
  baseline: { band: "baseline", emoji: "🟡", label: "Baseline", perUnitPesos: 35000 },
  good: { band: "good", emoji: "🟢", label: "Good", perUnitPesos: 40000 },
  strong: { band: "strong", emoji: "🟢", label: "Strong", perUnitPesos: 45000 },
  exceptional: { band: "exceptional", emoji: "🏆", label: "Exceptional", perUnitPesos: 50000 },
};

/** Which band a real per-unit monthly revenue figure falls into, against a
 * (possibly custom) tier table — never hardcoded ₱ literals at a call site. */
export function tierForUnitRevenue(revenuePesos: number, tiers: Record<TargetTierBand, TargetTierDefinition> = DEFAULT_TARGET_TIERS): TargetTierDefinition {
  if (revenuePesos >= tiers.exceptional.perUnitPesos) return tiers.exceptional;
  if (revenuePesos >= tiers.strong.perUnitPesos) return tiers.strong;
  if (revenuePesos >= tiers.good.perUnitPesos) return tiers.good;
  if (revenuePesos >= tiers.baseline.perUnitPesos) return tiers.baseline;
  return tiers.underperforming;
}

export type PortfolioTargetLadder = {
  baselinePesos: number;
  goodPesos: number;
  strongPesos: number;
  stretchPesos: number;
  unitCount: number;
};

/** The portfolio-level ladder — always unitCount × each per-unit tier, so
 * it automatically scales as units are added or removed (brief's own
 * "already support 6-unit expansion" requirement) without a redesign. */
export function computePortfolioTargetLadder(unitCount: number, tiers: Record<TargetTierBand, TargetTierDefinition> = DEFAULT_TARGET_TIERS): PortfolioTargetLadder {
  return {
    baselinePesos: unitCount * tiers.baseline.perUnitPesos,
    goodPesos: unitCount * tiers.good.perUnitPesos,
    strongPesos: unitCount * tiers.strong.perUnitPesos,
    stretchPesos: unitCount * tiers.exceptional.perUnitPesos,
    unitCount,
  };
}

export type LadderGapAnalysis = {
  toBaselinePesos: number; // negative = already past baseline
  toGoodPesos: number;
  toStrongPesos: number;
  toStretchPesos: number;
  currentBand: TargetTierBand;
};

/** How far a real revenue figure sits from each rung of the ladder — the
 * "do we simply need to reach baseline, or should we push toward stretch"
 * question, expressed as real signed peso gaps (negative once cleared). */
export function computeLadderGaps(revenuePesos: number, ladder: PortfolioTargetLadder, tiers: Record<TargetTierBand, TargetTierDefinition> = DEFAULT_TARGET_TIERS): LadderGapAnalysis {
  const perUnit = ladder.unitCount > 0 ? revenuePesos / ladder.unitCount : revenuePesos;
  return {
    toBaselinePesos: Math.round(ladder.baselinePesos - revenuePesos),
    toGoodPesos: Math.round(ladder.goodPesos - revenuePesos),
    toStrongPesos: Math.round(ladder.strongPesos - revenuePesos),
    toStretchPesos: Math.round(ladder.stretchPesos - revenuePesos),
    currentBand: tierForUnitRevenue(perUnit, tiers).band,
  };
}
