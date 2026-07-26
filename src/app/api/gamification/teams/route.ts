import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { manilaMonthStart } from "@/lib/format";
import { computeUnitGoal, type GoalBooking } from "@/lib/analytics/revenueGoals";
import { formatUnitDisplay } from "@/lib/format";

/**
 * Powers the "Teams" section of the gamification module (My Earnings) — a
 * lightweight, display-only grouping of staff by their existing role (no
 * new "team" concept in the schema): Booking Team = BOOKER employees,
 * Housekeeping Team = HOUSEKEEPING employees, Operations Team = OWNER_ADMIN
 * + CO_OWNER. Each team's "priority unit" is real, not arbitrary — the 3
 * units currently furthest behind their Monthly Revenue Target (same
 * computeUnitGoal() the Dashboard/Analytics goal panels use), worst-first,
 * one per team — so "priority" reflects which unit actually needs the most
 * attention this month, not a fixed assignment.
 */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const monthStart = manilaMonthStart();
  const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const prevMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));

  const [employees, bookingsThisMonth, bookingsLastMonth, cleaningLogsThisMonth, units, settings] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true, role: { in: ["BOOKER", "HOUSEKEEPING", "OWNER_ADMIN", "CO_OWNER"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.booking.findMany({
      where: { date: { gte: monthStart, lt: nextMonthStart } },
      select: { unitId: true, date: true, amount: true, paid: true, dpAmount: true, refundedAt: true, bookerId: true },
    }),
    prisma.booking.findMany({
      where: { date: { gte: prevMonthStart, lt: monthStart } },
      select: { unitId: true, date: true, amount: true, paid: true, dpAmount: true, refundedAt: true, bookerId: true },
    }),
    prisma.cleaningLog.findMany({
      where: { startedAt: { gte: monthStart, lt: nextMonthStart }, endedAt: { not: null } },
      select: { employeeId: true },
    }),
    prisma.unit.findMany({ select: { id: true, unitNumber: true, shortName: true, monthlyRevenueTargetOverride: true } }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, select: { monthlyRevenueTargetPerUnit: true } }),
  ]);

  const collected = (bs: GoalBooking[]) => bs.reduce((sum, b) => (b.refundedAt ? sum : sum + (b.paid ? b.amount : 0) + (b.dpAmount || 0)), 0);
  const toGoalBooking = (b: { unitId: string; date: Date; amount: number; paid: boolean; dpAmount: number | null; refundedAt: Date | null; bookerId: string | null }): GoalBooking => ({
    unitId: b.unitId, date: b.date.toISOString(), amount: b.amount, paid: b.paid, dpAmount: b.dpAmount, refundedAt: b.refundedAt?.toISOString() ?? null, bookerId: b.bookerId,
  });
  const thisMonthGoalBookings = bookingsThisMonth.map(toGoalBooking);
  const lastMonthGoalBookings = bookingsLastMonth.map(toGoalBooking);

  // Rank every unit by how far behind its monthly target it is (worst
  // first) — this is what decides each team's "priority unit" below.
  const now = new Date();
  const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const unitGoals = units
    .map((u) =>
      computeUnitGoal({
        unitId: u.id,
        unitLabel: formatUnitDisplay(u.unitNumber, u.shortName),
        targetPesos: u.monthlyRevenueTargetOverride ?? settings.monthlyRevenueTargetPerUnit,
        bookingsThisMonth: thisMonthGoalBookings,
        bookingsLastMonth: lastMonthGoalBookings,
        now: nowUtc,
        monthStart,
        monthEnd: nextMonthStart,
      })
    )
    .sort((a, b) => a.pctComplete - b.pctComplete);

  const bookers = employees.filter((e) => e.role === "BOOKER");
  const housekeepers = employees.filter((e) => e.role === "HOUSEKEEPING");
  const operations = employees.filter((e) => e.role === "OWNER_ADMIN" || e.role === "CO_OWNER");

  const bookingCountByBooker = new Map<string, number>();
  for (const b of bookingsThisMonth) {
    if (!b.bookerId) continue;
    bookingCountByBooker.set(b.bookerId, (bookingCountByBooker.get(b.bookerId) ?? 0) + 1);
  }
  const cleaningCountByEmployee = new Map<string, number>();
  for (const c of cleaningLogsThisMonth) {
    if (!c.employeeId) continue;
    cleaningCountByEmployee.set(c.employeeId, (cleaningCountByEmployee.get(c.employeeId) ?? 0) + 1);
  }

  const totalBookingsThisMonth = bookingsThisMonth.filter((b) => b.bookerId && bookers.some((e) => e.id === b.bookerId)).length;
  const totalCleaningsThisMonth = cleaningLogsThisMonth.filter((c) => c.employeeId && housekeepers.some((e) => e.id === c.employeeId)).length;
  const totalRevenueThisMonth = collected(thisMonthGoalBookings);

  const priorityUnit = (rank: number) => {
    const g = unitGoals[rank];
    if (!g) return null;
    return { unitId: g.unitId, unitLabel: g.unitLabel, pctComplete: g.pctComplete, currentPesos: g.currentPesos, targetPesos: g.targetPesos, remainingPesos: g.remainingPesos, status: g.status };
  };

  const teams = [
    {
      key: "booking", name: "Booking Team", theme: "Sales • Growth • Hospitality", accent: "blue",
      members: bookers.map((e) => ({ id: e.id, name: e.name, count: bookingCountByBooker.get(e.id) ?? 0 })),
      metricLabel: "Bookings logged this month", metricValue: totalBookingsThisMonth,
      priorityUnit: priorityUnit(0),
    },
    {
      key: "housekeeping", name: "Housekeeping Team", theme: "Cleanliness • Comfort", accent: "green",
      members: housekeepers.map((e) => ({ id: e.id, name: e.name, count: cleaningCountByEmployee.get(e.id) ?? 0 })),
      metricLabel: "Cleanings completed this month", metricValue: totalCleaningsThisMonth,
      priorityUnit: priorityUnit(1),
    },
    {
      key: "operations", name: "Operations Team", theme: "Maintenance • Reliability", accent: "orange",
      members: operations.map((e) => ({ id: e.id, name: e.name, count: 0 })),
      metricLabel: "Portfolio revenue this month", metricValue: totalRevenueThisMonth,
      priorityUnit: priorityUnit(2),
    },
  ];

  return NextResponse.json({ teams });
}
