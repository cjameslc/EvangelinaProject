// Pure, client-safe (no Prisma import) — Monthly Revenue Target math shared
// between the Dashboard and Analytics "Revenue Goals" panels, computed
// entirely from bookings both pages already fetch for the current/previous
// calendar month. No new database round trips for either page.

export type GoalBooking = {
  unitId: string;
  date: string; // ISO — used only for the "first to reach ₱50K" crossing-date milestone
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  refundedAt?: string | null;
  bookerId?: string | null;
};

/** Money actually in hand — same formula as every other revenue figure in
 * this app (Dashboard's collectedAmount, Analytics' collectedRevenueCentavos):
 * the full amount once paid, plus any downpayment on file, never a refunded
 * booking. */
function collected(bookings: GoalBooking[]): number {
  return bookings.reduce((sum, b) => {
    if (b.refundedAt) return sum;
    return sum + (b.paid ? b.amount : 0) + (b.dpAmount || 0);
  }, 0);
}

export type GoalStatus = "achieved" | "ahead" | "on_track" | "behind" | "at_risk";
export type Confidence = "low" | "medium" | "high";

export type UnitGoal = {
  unitId: string;
  unitLabel: string;
  targetPesos: number;
  currentPesos: number;
  remainingPesos: number;
  pctComplete: number;
  daysElapsed: number;
  daysRemaining: number;
  daysInMonth: number;
  requiredDailyAvgPesos: number;
  projectedPesos: number;
  expectedAchievementPct: number;
  confidence: Confidence;
  status: GoalStatus;
  lastMonthPesos: number | null;
};

/**
 * One unit's monthly goal snapshot. `now`/`monthStart`/`monthEnd` are passed
 * in (not computed internally) so caller and callee always agree on "today"
 * — same discipline as Dashboard's own monthRangeStart/monthRangeEnd fields.
 * Confidence rises as more of the month has actually been observed (same
 * "don't overstate an early-month linear projection" reasoning as
 * forecast.ts's trailingAverageForecast elsewhere in this app).
 */
export function computeUnitGoal(params: {
  unitId: string;
  unitLabel: string;
  targetPesos: number;
  bookingsThisMonth: GoalBooking[];
  bookingsLastMonth?: GoalBooking[];
  now: Date;
  monthStart: Date;
  monthEnd: Date;
}): UnitGoal {
  const { unitId, unitLabel, targetPesos, bookingsThisMonth, bookingsLastMonth, now, monthStart, monthEnd } = params;
  const own = bookingsThisMonth.filter((b) => b.unitId === unitId);
  const currentPesos = collected(own);

  const daysInMonth = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000));
  const rawElapsed = Math.floor((now.getTime() - monthStart.getTime()) / 86400000) + 1;
  const daysElapsed = Math.min(Math.max(rawElapsed, 1), daysInMonth);
  const daysRemaining = Math.max(daysInMonth - daysElapsed, 0);

  const remainingPesos = Math.max(targetPesos - currentPesos, 0);
  const pctComplete = targetPesos > 0 ? Math.round((currentPesos / targetPesos) * 100) : 0;
  const requiredDailyAvgPesos = daysRemaining > 0 ? Math.ceil(remainingPesos / daysRemaining) : remainingPesos;

  const dailyPaceSoFar = currentPesos / daysElapsed;
  const projectedPesos = Math.round(dailyPaceSoFar * daysInMonth);
  const expectedAchievementPct = targetPesos > 0 ? Math.round((projectedPesos / targetPesos) * 100) : 0;

  const elapsedFrac = daysElapsed / daysInMonth;
  const confidence: Confidence = elapsedFrac < 0.2 ? "low" : elapsedFrac < 0.6 ? "medium" : "high";

  let status: GoalStatus;
  if (currentPesos >= targetPesos) status = "achieved";
  else if (expectedAchievementPct >= 100) status = "ahead";
  else if (expectedAchievementPct >= 85) status = "on_track";
  else if (expectedAchievementPct >= 60) status = "behind";
  else status = "at_risk";

  const lastMonthPesos = bookingsLastMonth ? collected(bookingsLastMonth.filter((b) => b.unitId === unitId)) : null;

  return {
    unitId, unitLabel, targetPesos, currentPesos, remainingPesos, pctComplete,
    daysElapsed, daysRemaining, daysInMonth, requiredDailyAvgPesos, projectedPesos,
    expectedAchievementPct, confidence, status, lastMonthPesos,
  };
}

export function computePortfolioGoal(unitGoals: UnitGoal[]) {
  const targetPesos = unitGoals.reduce((s, g) => s + g.targetPesos, 0);
  const currentPesos = unitGoals.reduce((s, g) => s + g.currentPesos, 0);
  const remainingPesos = Math.max(targetPesos - currentPesos, 0);
  const pctComplete = targetPesos > 0 ? Math.round((currentPesos / targetPesos) * 100) : 0;
  return { targetPesos, currentPesos, remainingPesos, pctComplete, unitCount: unitGoals.length };
}

export type Milestone = { icon: string; label: string; detail: string };

/**
 * "First Unit to Reach ₱50K" is a fixed round-number checkpoint,
 * deliberately independent of whatever the configured per-unit target
 * currently is (an admin could set targets above or below ₱50K) — so it's
 * checked separately from "Target Achieved". "First" is resolved honestly
 * from real data: each qualifying unit's own booking dates are walked in
 * order to find the actual date its cumulative collected revenue first
 * crossed ₱50,000 this month, and the earliest such date wins — not a
 * guess.
 */
const FIRST_TO_MILESTONE_PESOS = 50000;

export function computeMilestones(unitGoals: UnitGoal[], bookingsThisMonth: GoalBooking[]): Milestone[] {
  const badges: Milestone[] = [];

  for (const g of unitGoals) {
    if (g.status === "achieved") {
      badges.push({ icon: "🏆", label: "Target Achieved", detail: `${g.unitLabel} hit its ₱${g.targetPesos.toLocaleString()} monthly target.` });
    } else if (g.pctComplete >= 90) {
      badges.push({ icon: "🔥", label: "90% Completed", detail: `${g.unitLabel} is at ${g.pctComplete}% of its target.` });
    }
  }

  if (unitGoals.length > 0) {
    // Same unrounded-ratio sort as computeLeaderboard — sorting on the
    // already-rounded pctComplete could pick the wrong unit as "top" on a
    // rounding tie (e.g. 82.39% and 81.52% both display "82%").
    const top = [...unitGoals].sort((a, b) => {
      const ra = a.targetPesos > 0 ? a.currentPesos / a.targetPesos : 0;
      const rb = b.targetPesos > 0 ? b.currentPesos / b.targetPesos : 0;
      return rb - ra || b.currentPesos - a.currentPesos;
    })[0];
    if (top.currentPesos > 0) badges.push({ icon: "⭐", label: "Top Performing Unit", detail: `${top.unitLabel} leads at ${top.pctComplete}% of target.` });
  }

  let earliestUnit: string | null = null;
  let earliestDate = Infinity;
  for (const g of unitGoals) {
    const own = bookingsThisMonth.filter((b) => b.unitId === g.unitId && !b.refundedAt).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cumulative = 0;
    for (const b of own) {
      cumulative += (b.paid ? b.amount : 0) + (b.dpAmount || 0);
      if (cumulative >= FIRST_TO_MILESTONE_PESOS) {
        const t = new Date(b.date).getTime();
        if (t < earliestDate) { earliestDate = t; earliestUnit = g.unitLabel; }
        break;
      }
    }
  }
  if (earliestUnit) badges.push({ icon: "💰", label: "First Unit to Reach ₱50K", detail: `${earliestUnit} was the first to cross ₱50,000 in collected revenue this month.` });

  if (unitGoals.length > 0 && unitGoals.every((g) => g.status === "achieved")) {
    badges.push({ icon: "🎉", label: "All Units Achieved Target", detail: "Every unit has hit its monthly target." });
  }

  return badges;
}

export type LeaderboardHighlight = "top" | "fastest_growing" | "most_improved";
export type LeaderboardRow = UnitGoal & { rank: number; highlights: LeaderboardHighlight[] };

/**
 * "Fastest growing" / "most improved" both need a real previous-month
 * baseline (lastMonthPesos) — a unit with no data for last month (new unit,
 * or genuinely ₱0 collected) is never a candidate for either rather than
 * dividing by zero or fabricating a rate.
 */
export function computeLeaderboard(unitGoals: UnitGoal[]): LeaderboardRow[] {
  // Ranked on the real, unrounded ratio — not `pctComplete`, which is
  // already Math.round()'d for display (see computeUnitGoal). Two units a
  // few hundred pesos apart can both round to the same whole-number
  // percent (e.g. 82.39% and 81.52% both show "82%"); sorting on the
  // rounded field then leaves the tie broken by whatever order the units
  // happened to arrive in (their Admin-configured sortOrder), not by who
  // actually earned more — a real bug, confirmed against production data
  // where a higher-revenue unit displayed below a lower-revenue one.
  // currentPesos is the final tiebreaker for a genuine exact-ratio tie.
  const ratio = (g: UnitGoal) => (g.targetPesos > 0 ? g.currentPesos / g.targetPesos : 0);
  const sorted = [...unitGoals].sort((a, b) => ratio(b) - ratio(a) || b.currentPesos - a.currentPesos);
  const rows: LeaderboardRow[] = sorted.map((g, i) => ({ ...g, rank: i + 1, highlights: [] }));
  if (rows.length > 0 && rows[0].currentPesos > 0) rows[0].highlights.push("top");

  let fastestIdx = -1, fastestRatio = 1; // must exceed last month's pace to count as "growing"
  let improvedIdx = -1, improvedDelta = 0;
  rows.forEach((g, i) => {
    if (g.lastMonthPesos && g.lastMonthPesos > 0) {
      const paceNow = g.currentPesos / g.daysElapsed;
      const paceLast = g.lastMonthPesos / g.daysInMonth;
      const ratio = paceLast > 0 ? paceNow / paceLast : 0;
      if (ratio > fastestRatio) { fastestRatio = ratio; fastestIdx = i; }
      const delta = g.projectedPesos - g.lastMonthPesos;
      if (delta > improvedDelta) { improvedDelta = delta; improvedIdx = i; }
    }
  });
  if (fastestIdx >= 0) rows[fastestIdx].highlights.push("fastest_growing");
  if (improvedIdx >= 0) rows[improvedIdx].highlights.push("most_improved");

  return rows;
}

/**
 * Deterministic, template-based narrative — NOT an LLM call. These are
 * formulaic status statements with no real ambiguity to reason through, and
 * this app's Gemini API key has a hard 20-requests/day free-tier cap already
 * shared across the guest AI Concierge, the Dashboard insight, and the
 * Analytics AI Insights panels (see analyticsInsight.ts) — adding a call
 * here (auto-computed per unit, on every Dashboard/Analytics load) would
 * burn that budget on sentences that don't need real inference. Every
 * number quoted is real, pulled straight from the UnitGoal it's given.
 */
export function generateGoalInsight(g: UnitGoal): string {
  if (g.status === "achieved") {
    const remaining = g.daysRemaining > 0 ? ` with ${g.daysRemaining} day${g.daysRemaining === 1 ? "" : "s"} left in the month` : "";
    return `${g.unitLabel} has already achieved its ₱${g.targetPesos.toLocaleString()} monthly target${remaining}.`;
  }
  if (g.status === "ahead") {
    return `${g.unitLabel} has already achieved ${g.pctComplete}% of its monthly target with ${g.daysRemaining} day${g.daysRemaining === 1 ? "" : "s"} remaining. It is on track to exceed its goal.`;
  }
  if (g.status === "at_risk") {
    const shortfall = Math.max(g.targetPesos - g.projectedPesos, 0);
    return `Based on the current booking pace, ${g.unitLabel} is projected to finish approximately ₱${shortfall.toLocaleString()} below its monthly goal.`;
  }
  return `${g.unitLabel} has achieved only ${g.pctComplete}% of its target. Increasing weekday bookings or promoting Daycation packages could help close the gap.`;
}

export function computeBookerContribution(bookerId: string, goal: UnitGoal, bookingsThisMonth: GoalBooking[]) {
  const own = bookingsThisMonth.filter((b) => b.unitId === goal.unitId && b.bookerId === bookerId);
  const revenuePesos = collected(own);
  const pctOfUnitGoal = goal.targetPesos > 0 ? Math.round((revenuePesos / goal.targetPesos) * 100) : 0;
  return { revenuePesos, pctOfUnitGoal };
}
