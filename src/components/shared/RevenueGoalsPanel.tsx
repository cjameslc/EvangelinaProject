"use client";

import { Accordion } from "@/components/ui/Accordion";
import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { generateGoalInsight, type UnitGoal, type LeaderboardRow, type Milestone } from "@/lib/analytics/revenueGoals";

// "At risk" no longer gets a distinct, more-alarming color than "Behind" —
// both are a revenue-goal projection running under target, not an
// operational safety/access issue (compare Upcoming Expenses' genuinely
// urgent "Overdue" bills, which still use rausch deliberately). Collapsing
// them to the same amber keeps the dashboard's red reserved for things
// that actually need action right now.
const STATUS_STYLE: Record<UnitGoal["status"], { label: string; cls: string }> = {
  achieved: { label: "Achieved", cls: "bg-teal/10 text-teal" },
  ahead: { label: "Ahead of target", cls: "bg-teal/10 text-teal" },
  on_track: { label: "On track", cls: "bg-gold/10 text-gold" },
  behind: { label: "Behind", cls: "bg-amber/10 text-amber" },
  at_risk: { label: "At risk", cls: "bg-amber/10 text-amber" },
};

const CONFIDENCE_LABEL: Record<UnitGoal["confidence"], string> = { low: "low confidence", medium: "medium confidence", high: "high confidence" };

function ProgressBar({ pct, tone = "violet" }: { pct: number; tone?: "violet" | "teal" | "gold" | "amber" }) {
  // teal/gold/amber are real status meanings (achieved/on-track/behind) —
  // fixed regardless of skin/theme, same "never repaint a real status"
  // principle the Seasonal Skin System already applies elsewhere. "violet"
  // is the neutral/default case (no status opinion yet), which is what
  // should actually track the active skin/personal theme's own primary
  // color instead of being pinned to violet specifically.
  const bar = tone === "teal" ? "bg-teal" : tone === "gold" ? "bg-gold" : tone === "amber" ? "bg-amber" : undefined;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
      <div
        className={cn("h-full rounded-full transition-all", bar)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: bar ? undefined : "var(--skin-primary, #6c5ce7)" }}
      />
    </div>
  );
}

function UnitGoalCard({ goal, badges }: { goal: UnitGoal; badges: Milestone[] }) {
  const style = STATUS_STYLE[goal.status];
  const tone = goal.status === "achieved" || goal.status === "ahead" ? "teal" : goal.status === "on_track" ? "gold" : "amber";
  const unitBadges = badges.filter((b) => b.detail.startsWith(goal.unitLabel));

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-[13.5px] font-extrabold">{goal.unitLabel}</h4>
          <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", style.cls)}>{style.label}</span>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-extrabold tracking-tight">{goal.pctComplete}%</div>
          <div className="text-[10.5px] text-[var(--gray)]">of {peso(goal.targetPesos)}</div>
        </div>
      </div>

      <div className="mt-2.5"><ProgressBar pct={goal.pctComplete} tone={tone} /></div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        <div><span className="text-[var(--gray)]">Current</span><div className="font-bold">{peso(goal.currentPesos)}</div></div>
        <div><span className="text-[var(--gray)]">Remaining</span><div className="font-bold">{peso(goal.remainingPesos)}</div></div>
        <div><span className="text-[var(--gray)]">Days left</span><div className="font-bold">{goal.daysRemaining}</div></div>
        <div><span className="text-[var(--gray)]">Needed/day</span><div className="font-bold">{goal.remainingPesos > 0 ? `${peso(goal.requiredDailyAvgPesos)}` : "—"}</div></div>
      </div>

      <div className="mt-3 rounded-xl bg-[var(--bg-2)] p-2.5 text-[11px] text-[var(--gray)]">
        <div className="flex items-center justify-between font-semibold text-[var(--ink)]">
          <span>Projected: {peso(goal.projectedPesos)}</span>
          <span>{goal.expectedAchievementPct}% of target</span>
        </div>
        <div className="mt-0.5">{CONFIDENCE_LABEL[goal.confidence]} · based on {goal.daysElapsed} day{goal.daysElapsed === 1 ? "" : "s"} so far</div>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--gray)]">{generateGoalInsight(goal)}</p>

      {unitBadges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {unitBadges.map((b, i) => (
            <span key={i} title={b.detail} className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold">{b.icon} {b.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RevenueGoalsPanel({
  portfolio, unitGoals, milestones, leaderboard, bookerContribution,
}: {
  portfolio: { targetPesos: number; currentPesos: number; remainingPesos: number; pctComplete: number; unitCount: number };
  unitGoals: UnitGoal[];
  milestones: Milestone[];
  leaderboard: LeaderboardRow[];
  bookerContribution?: { unitLabel: string; revenuePesos: number; pctOfUnitGoal: number }[];
}) {
  if (unitGoals.length === 0) return null;

  return (
    <Accordion title="Monthly Revenue Goal" sub={`${portfolio.pctComplete}% complete`}>
      <div className="space-y-4">
        {/* Portfolio summary */}
        <div className="rounded-2xl border border-[var(--line)] bg-gradient-to-br from-violet/[.06] to-gold/[.04] p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Target</p>
              <p className="text-[26px] font-extrabold tracking-tight">{peso(portfolio.targetPesos)}</p>
              <p className="text-[11px] text-[var(--gray)]">({portfolio.unitCount} unit{portfolio.unitCount === 1 ? "" : "s"} × {peso(portfolio.targetPesos / Math.max(portfolio.unitCount, 1))})</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Current revenue</p>
              <p className="text-[22px] font-extrabold tracking-tight text-teal">{peso(portfolio.currentPesos)}</p>
              <p className="text-[11px] text-[var(--gray)]">{peso(portfolio.remainingPesos)} remaining</p>
            </div>
          </div>
          <div className="mt-3"><ProgressBar pct={portfolio.pctComplete} tone={portfolio.pctComplete >= 100 ? "teal" : "violet"} /></div>
          <p className="mt-1.5 text-[11.5px] font-bold text-[var(--gray)]">{portfolio.pctComplete}% complete</p>
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {milestones.map((m, i) => (
              <span key={i} title={m.detail} className="animate-pop-in rounded-full border border-[var(--line)] bg-[var(--card)] px-2.5 py-1 text-[11.5px] font-bold">
                {m.icon} {m.label}
              </span>
            ))}
          </div>
        )}

        {/* Per-unit cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {unitGoals.map((g) => <UnitGoalCard key={g.unitId} goal={g} badges={milestones} />)}
        </div>

        {/* Booker contribution (only rendered when the caller passes it — Booker role) */}
        {bookerContribution && bookerContribution.length > 0 && (
          <div className="rounded-2xl border border-[var(--line)] p-4">
            <h4 className="mb-2 text-[12.5px] font-extrabold">Your contribution</h4>
            <div className="space-y-2">
              {bookerContribution.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-[12px]">
                  <span className="text-[var(--gray)]">{b.unitLabel}</span>
                  <span className="font-bold">{peso(b.revenuePesos)} <span className="text-[var(--gray)]">({b.pctOfUnitGoal}% of goal)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h4 className="mb-2 text-[12.5px] font-extrabold">Leaderboard — this month</h4>
          <div className="space-y-1.5">
            {leaderboard.map((row) => (
              <div key={row.unitId} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-[var(--bg-2)]">
                <span className="w-5 flex-none text-center text-[12px] font-extrabold text-[var(--gray)]">#{row.rank}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{row.unitLabel}</span>
                {row.highlights.includes("top") && <span title="Highest % of target">⭐</span>}
                {row.highlights.includes("fastest_growing") && <span title="Fastest growing pace vs. last month">🚀</span>}
                {row.highlights.includes("most_improved") && <span title="Most improved vs. last month">📈</span>}
                <span className="flex-none text-[12px] font-bold">{peso(row.currentPesos)}</span>
                <span className="w-12 flex-none text-right text-[11.5px] font-bold text-[var(--gray)]">{row.pctComplete}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Accordion>
  );
}
