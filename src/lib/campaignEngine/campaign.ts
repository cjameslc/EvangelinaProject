// Sales Championship campaign engine — everything here is a pure function
// over already-fetched data (no Prisma imports), so it's unit-testable and
// reusable from both the dashboard API route and the month-end freeze logic
// without re-deriving anything. See types.ts for the shared shapes.
//
// Two distinct "done" moments this module deliberately keeps separate:
//   1. targetAchieved — the live ₱-total crosses targetPesos. Can happen
//      any day mid-period; more bookings keep arriving afterward and can
//      still change who's #1. This only ever flips a celebration/banner on
//      — it never freezes anything.
//   2. CLOSED (see the API route) — the period itself has ended. Only then
//      are final rank/profit/reward numbers ever persisted. A campaign can
//      close CLOSED without ever reaching target (no winner, no rewards —
//      see computeWinner below).
import type {
  Achievement, BookerTotals, CampaignBooking, CampaignParticipantInput, DailyPoint,
  Milestone, RankedParticipant, TeamBattleSide,
} from "./types";

const MILESTONE_DEFS: { fraction: number; label: string; emoji: string }[] = [
  { fraction: 0.2, label: "Getting Started", emoji: "🟢" },
  { fraction: 0.4, label: "Momentum", emoji: "🔵" },
  { fraction: 0.6, label: "Halfway Heroes", emoji: "🟣" },
  { fraction: 0.8, label: "Final Push", emoji: "🟠" },
  { fraction: 1.0, label: "Target Achieved", emoji: "🏆" },
];

/** Milestones scale with whatever targetPesos is configured for this campaign — never hardcoded to ₱250K, so a future campaign's different target still gets a correct 5-step journey. */
export function computeMilestones(targetPesos: number, totalProfitPesos: number): Milestone[] {
  return MILESTONE_DEFS.map((m) => ({
    fraction: m.fraction,
    pesos: Math.round(targetPesos * m.fraction),
    label: m.label,
    emoji: m.emoji,
    unlocked: totalProfitPesos >= targetPesos * m.fraction,
  }));
}

/** Ranked strictly by profitPesos (never bookingCount/revenuePesos/occupancy — see the brief's own explicit ranking rule). Ties broken by name for stable, deterministic ordering. */
export function rankParticipants(
  participants: CampaignParticipantInput[],
  totals: Map<string, BookerTotals>,
  previousFinals: Map<string, number> | null
): RankedParticipant[] {
  const withTotals = participants.map((p) => {
    const t = totals.get(p.employeeId) ?? { employeeId: p.employeeId, profitPesos: 0, revenuePesos: 0, bookingCount: 0 };
    const prev = previousFinals?.get(p.employeeId) ?? null;
    const trendPct = prev && prev > 0 ? Math.round(((t.profitPesos - prev) / prev) * 100) : null;
    return { ...p, ...t, rank: 0, trendPct };
  });
  withTotals.sort((a, b) => b.profitPesos - a.profitPesos || a.name.localeCompare(b.name));
  return withTotals.map((p, i) => ({ ...p, rank: i + 1 }));
}

export function computeTeamBattle(ranked: RankedParticipant[], targetPesos: number): { A: TeamBattleSide; B: TeamBattleSide; leadingSide: string | null } | null {
  const sides = Array.from(new Set(ranked.map((r) => r.side))).filter(Boolean);
  if (sides.length < 2) return null; // not enough sides configured for a battle yet
  const build = (side: string): TeamBattleSide => {
    const members = ranked.filter((r) => r.side === side);
    const totalProfitPesos = members.reduce((s, m) => s + m.profitPesos, 0);
    const totalRevenuePesos = members.reduce((s, m) => s + m.revenuePesos, 0);
    const totalBookings = members.reduce((s, m) => s + m.bookingCount, 0);
    return {
      side,
      members,
      totalProfitPesos,
      totalRevenuePesos,
      totalBookings,
      avgProfitPerBooker: members.length > 0 ? Math.round(totalProfitPesos / members.length) : 0,
      avgProfitPerBooking: totalBookings > 0 ? Math.round(totalProfitPesos / totalBookings) : 0,
      contributionPct: targetPesos > 0 ? Math.round((totalProfitPesos / targetPesos) * 100) : 0,
    };
  };
  const A = build("A");
  const B = build("B");
  const leadingSide = A.totalProfitPesos === B.totalProfitPesos ? null : A.totalProfitPesos > B.totalProfitPesos ? "A" : "B";
  return { A, B, leadingSide };
}

/** Section 11 + 19 are the same feature (dynamic per-viewer motivational copy) — one function serves both. */
export function motivationForViewer(ranked: RankedParticipant[], viewerEmployeeId: string | null): string | null {
  if (!viewerEmployeeId) return null;
  const idx = ranked.findIndex((r) => r.employeeId === viewerEmployeeId);
  if (idx === -1) return null;
  const viewer = ranked[idx];
  if (idx === 0) return ranked.length > 1 ? "👑 You're leading the September Championship." : "👑 You're currently #1.";
  const ahead = ranked[idx - 1];
  const gap = ahead.profitPesos - viewer.profitPesos;
  if (idx === 1) return `🔥 You're only ₱${gap.toLocaleString("en-PH")} away from #1.`;
  if (idx === ranked.length - 1) return "💪 The race is still open. Keep pushing.";
  return `🚀 You are ₱${gap.toLocaleString("en-PH")} away from overtaking #${idx} (${ahead.name}).`;
}

/** Full day-by-day cumulative profit series across the period, one pass over pre-sorted bookings — powers both the Profit Trend chart and achievement-feed derivation below. Stops at min(periodEnd, today) so an in-progress campaign doesn't project fake future days. */
export function computeDailySeries(bookings: CampaignBooking[], periodStart: Date, periodEnd: Date, employeeIds: string[], now: Date = new Date()): DailyPoint[] {
  const lastDayMs = Math.min(periodEnd.getTime() - 86400000, Math.max(now.getTime(), periodStart.getTime()));
  if (lastDayMs < periodStart.getTime()) return [];
  const sorted = [...bookings].sort((a, b) => a.date.getTime() - b.date.getTime());
  const running: Record<string, number> = {};
  for (const id of employeeIds) running[id] = 0;
  let idx = 0;
  const points: DailyPoint[] = [];
  for (let t = periodStart.getTime(); t <= lastDayMs; t += 86400000) {
    while (idx < sorted.length && sorted[idx].date.getTime() <= t) {
      const b = sorted[idx];
      if (b.bookerId && b.bookerId in running) {
        running[b.bookerId] += b.refundedAt ? 0 : (b.paid ? b.amount : 0) + (b.dpAmount || 0);
      }
      idx++;
    }
    const total = Object.values(running).reduce((s, v) => s + v, 0);
    points.push({ dateIso: new Date(t).toISOString().slice(0, 10), totalProfitPesos: total, byEmployee: { ...running } });
  }
  return points;
}

/** Derives a real, evidence-based achievement feed purely from the daily series + roster — no separate event log to keep in sync, and nothing here is ever persisted (recomputed fresh on every request, so it's always consistent with the live numbers). Capped and newest-first. */
export function deriveAchievements(
  daily: DailyPoint[],
  participants: CampaignParticipantInput[],
  targetPesos: number,
  monthLabel: string
): Achievement[] {
  const achievements: Achievement[] = [];
  const nameOf = (id: string) => participants.find((p) => p.employeeId === id)?.name ?? "Someone";
  const sideOf = (id: string) => participants.find((p) => p.employeeId === id)?.side;

  let prevLeader: string | null = null;
  let prevTotalMilestoneIdx = -1;
  const sideMilestoneIdx: Record<string, number> = {};

  for (const point of daily) {
    // #1 rank changes
    const entries = Object.entries(point.byEmployee);
    if (entries.length > 0) {
      const [leaderId, leaderAmt] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (leaderAmt > 0 && leaderId !== prevLeader && prevLeader !== null) {
        achievements.push({ id: `lead-${point.dateIso}`, emoji: "🏆", message: `${nameOf(leaderId)} moved into #1`, dateIso: point.dateIso });
      }
      if (leaderAmt > 0) prevLeader = leaderId;
    }

    // Overall target milestones
    const totalIdx = MILESTONE_DEFS.reduce((acc, m, i) => (point.totalProfitPesos >= targetPesos * m.fraction ? i : acc), -1);
    if (totalIdx > prevTotalMilestoneIdx) {
      for (let i = prevTotalMilestoneIdx + 1; i <= totalIdx; i++) {
        const m = MILESTONE_DEFS[i];
        achievements.push({ id: `milestone-${i}-${point.dateIso}`, emoji: m.emoji, message: `${monthLabel} reached ${Math.round(m.fraction * 100)}% of target (₱${Math.round(targetPesos * m.fraction).toLocaleString("en-PH")})`, dateIso: point.dateIso });
      }
      prevTotalMilestoneIdx = totalIdx;
    }

    // Per-side milestones (same 5 fractions, applied to that side's own subtotal)
    const bySide: Record<string, number> = {};
    for (const [empId, amt] of entries) {
      const s = sideOf(empId);
      if (!s) continue;
      bySide[s] = (bySide[s] ?? 0) + amt;
    }
    for (const [side, amt] of Object.entries(bySide)) {
      const idx2 = MILESTONE_DEFS.reduce((acc, m, i) => (amt >= targetPesos * m.fraction ? i : acc), -1);
      const prevIdx = sideMilestoneIdx[side] ?? -1;
      if (idx2 > prevIdx) {
        const m = MILESTONE_DEFS[idx2];
        achievements.push({ id: `side-${side}-${idx2}-${point.dateIso}`, emoji: "🚀", message: `Group ${side} crossed ₱${Math.round(targetPesos * m.fraction).toLocaleString("en-PH")}`, dateIso: point.dateIso });
        sideMilestoneIdx[side] = idx2;
      }
    }
  }

  return achievements.reverse().slice(0, 8);
}

export function computeWinner(ranked: RankedParticipant[], targetAchieved: boolean): { employeeId: string; name: string; profitPesos: number } | null {
  if (!targetAchieved || ranked.length === 0) return null;
  const top = ranked[0];
  return { employeeId: top.employeeId, name: top.name, profitPesos: top.profitPesos };
}
