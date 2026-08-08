import { getRevenueGoalsData, type AnalyticsFilters } from "@/app/analytics/queries";
import { computeUnitGoal, computePortfolioGoal, computeMilestones, computeLeaderboard } from "@/lib/analytics/revenueGoals";
import { RevenueGoalsPanel } from "@/components/shared/RevenueGoalsPanel";
import { formatUnitDisplay } from "@/lib/format";

// Analytics is gated to OWNER_ADMIN/CO_OWNER only (canSeeAnalytics) — a
// Booker never reaches this page, so unlike the Dashboard instance of this
// same panel, there's no "Your contribution" block to compute here.
export async function RevenueGoalsSection({ user, filters }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters }) {
  const data = await getRevenueGoalsData(user, filters);
  const now = new Date();
  const monthStart = new Date(data.monthStart);
  const monthEnd = new Date(data.monthEnd);

  const unitGoals = data.units.map((u: { id: string; shortName: string; unitNumber: string; monthlyRevenueTargetOverride: number | null }) =>
    computeUnitGoal({
      unitId: u.id,
      unitLabel: formatUnitDisplay(u.unitNumber, u.shortName),
      targetPesos: u.monthlyRevenueTargetOverride ?? data.monthlyRevenueTargetPerUnit,
      bookingsThisMonth: data.bookingsThisMonth,
      bookingsLastMonth: data.bookingsLastMonth,
      now,
      monthStart,
      monthEnd,
    })
  );
  const portfolio = computePortfolioGoal(unitGoals);
  const milestones = computeMilestones(unitGoals, data.bookingsThisMonth);
  const leaderboard = computeLeaderboard(unitGoals);

  return <RevenueGoalsPanel portfolio={portfolio} unitGoals={unitGoals} milestones={milestones} leaderboard={leaderboard} />;
}
