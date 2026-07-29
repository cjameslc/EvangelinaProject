import { useMemo } from "react";
import { formatUnitDisplay } from "@/lib/format";
import { computeUnitGoal, computePortfolioGoal, computeMilestones, computeLeaderboard, computeBookerContribution } from "@/lib/analytics/revenueGoals";

type Unit = { id: string; unitNumber: string; shortName: string; monthlyRevenueTargetOverride?: number | null };
type Booking = { unitId: string; date: string; amount: number; paid: boolean; dpAmount: number | null; refundedAt?: string | null; bookerId?: string | null };
type Employee = { id: string; userId?: string | null };

// Monthly Revenue Goal — entirely derived from bookingsMonth/bookingsPrevMonth,
// both already fetched for other cards on the Dashboard; no extra request.
// Colocated with RevenueGoalsPanel.tsx (the component this feeds) rather
// than living in dashboard/hooks — it's shared UI, not Dashboard-specific
// business logic.
export function useRevenueGoalsPanelData({
  role,
  units,
  bookingsMonth,
  bookingsPrevMonth,
  monthlyRevenueTargetPerUnit,
  monthRangeStart,
  monthRangeEnd,
  employees,
  currentUserId,
}: {
  role: string;
  units: Unit[];
  bookingsMonth: Booking[];
  bookingsPrevMonth: Booking[];
  monthlyRevenueTargetPerUnit: number;
  monthRangeStart: string;
  monthRangeEnd: string;
  employees: Employee[];
  currentUserId?: string | null;
}) {
  const unitGoals = useMemo(
    () =>
      units.map((u) =>
        computeUnitGoal({
          unitId: u.id,
          unitLabel: formatUnitDisplay(u.unitNumber, u.shortName),
          targetPesos: u.monthlyRevenueTargetOverride ?? monthlyRevenueTargetPerUnit,
          bookingsThisMonth: bookingsMonth,
          bookingsLastMonth: bookingsPrevMonth,
          now: new Date(),
          monthStart: new Date(monthRangeStart),
          monthEnd: new Date(monthRangeEnd),
        })
      ),
    [units, bookingsMonth, bookingsPrevMonth, monthlyRevenueTargetPerUnit, monthRangeStart, monthRangeEnd]
  );
  const revenueGoalPortfolio = useMemo(() => computePortfolioGoal(unitGoals), [unitGoals]);
  const revenueGoalMilestones = useMemo(() => computeMilestones(unitGoals, bookingsMonth), [unitGoals, bookingsMonth]);
  const revenueGoalLeaderboard = useMemo(() => computeLeaderboard(unitGoals), [unitGoals]);
  const ownEmployeeId = useMemo(() => employees.find((e) => e.userId === currentUserId)?.id ?? null, [employees, currentUserId]);
  const bookerContribution = useMemo(() => {
    if (role !== "BOOKER" || !ownEmployeeId) return undefined;
    return unitGoals
      .map((g) => ({ unitLabel: g.unitLabel, ...computeBookerContribution(ownEmployeeId, g, bookingsMonth) }))
      .filter((c) => c.revenuePesos > 0);
  }, [role, ownEmployeeId, unitGoals, bookingsMonth]);

  return { unitGoals, revenueGoalPortfolio, revenueGoalMilestones, revenueGoalLeaderboard, bookerContribution };
}
