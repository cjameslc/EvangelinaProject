import { NextRequest, NextResponse } from "next/server";
import { prismaPool } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { periodRangeFor, type AnalyticsPeriodType } from "@/lib/analytics/period";
import { computeTeamBreakdown, isPayrollRole, salaryForPeriod, type PayrollRates, type DashboardPeriodType } from "@/lib/payroll";
import { isCommissionEligible, isBookingCompleted } from "@/lib/bookingStatus";
import { nightsFor } from "@/lib/stayRange";
import { TEAMS } from "@/lib/constants";
import { collectedAmountPesos } from "@/lib/finance";

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * Owner View's data source for My Earnings — Executive Summary, Booker
 * Performance, Housekeeping Summary, and Team Performance, all scoped to
 * one selectable range (This/Last Week/Month or a custom range) so every
 * section on the page reflects the same period at once instead of each
 * pulling its own independent window.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const rangeType = (sp.get("rangeType") ?? "weekly") as AnalyticsPeriodType;
  const offset = Number(sp.get("offset") ?? "0");
  const customStart = sp.get("start") ?? undefined;
  const customEnd = sp.get("end") ?? undefined;
  const { start, end } = periodRangeFor(rangeType, offset, customStart && customEnd ? { start: customStart, end: customEnd } : undefined);
  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const salaryPeriod: DashboardPeriodType = rangeType === "quarterly" ? "custom" : (rangeType as DashboardPeriodType);

  // ownerId scoping throughout — an Owner/Co-owner must only ever see their
  // own tenant's staff/bookings/cleanings here, never every tenant on the
  // platform (Booking has no direct ownerId, so it's scoped via unit.ownerId).
  const [employees, settings, bookings, cleaningLogs, activeUnitCount] = await Promise.all([
    prismaPool[0].employee.findMany({ where: { active: true, ownerId: user.ownerId }, orderBy: { name: "asc" } }),
    prismaPool[1].settings.upsert({ where: { ownerId: user.ownerId! }, update: {}, create: { ownerId: user.ownerId! } }),
    // Booker/cleaner attribution needs anyone active in the window regardless
    // of exact check-in date vs. checkout, so this pulls a slightly wider
    // net (whole days the range touches) the same way my-earnings does.
    prismaPool[2].booking.findMany({
      where: { date: { gte: start, lt: end }, unit: { ownerId: user.ownerId } },
      select: { id: true, unitId: true, bookerId: true, cleanerId: true, stayType: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true, platform: true, paid: true, amount: true, dpAmount: true, refundedAt: true, cancelledAt: true, cancellationCategory: true },
    }),
    prismaPool[3].cleaningLog.findMany({ where: { startedAt: { gte: start, lt: end }, unit: { ownerId: user.ownerId } }, select: { employeeId: true, unitId: true, startedAt: true } }),
    prismaPool[4].unit.count({ where: { active: true, ownerId: user.ownerId } }),
  ]);

  const rates: PayrollRates = {
    housekeepingDayRate: settings.housekeepingDayRate,
    housekeepingNightBonus: settings.housekeepingNightBonus,
    bookerCommission: settings.bookerCommission,
    auditorWeeklyRate: settings.auditorWeeklyRate,
  };

  const normalized = bookings.map((b) => ({
    bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType,
    date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null,
    checkOutTime: b.checkOutTime, checkInTime: b.checkInTime, paid: b.paid, cancelledAt: b.cancelledAt?.toISOString() ?? null,
    cancellationCategory: b.cancellationCategory, dpAmount: b.dpAmount, refundedAt: b.refundedAt?.toISOString() ?? null,
  }));

  const payrollEmployees = employees.filter((e) => isPayrollRole(e.role));

  const rows = payrollEmployees.map((emp) => {
    const myCleaningLogs = cleaningLogs.filter((c) => c.employeeId === emp.id);
    const cleaningDays = new Set(myCleaningLogs.map((c) => dayOf(c.startedAt))).size;
    const fixedSalary = Math.round(salaryForPeriod(emp.monthlySalary, salaryPeriod, periodDays));
    const breakdown = computeTeamBreakdown(emp, {
      cleaningDays,
      weekBookings: normalized,
      weekExpenses: [],
      rates,
      portfolioBookings: emp.role === "HOUSEKEEPING" ? normalized : undefined,
      totalUnits: emp.role === "HOUSEKEEPING" ? activeUnitCount : undefined,
    });
    const successfulBookings = bookings.filter((b) => b.bookerId === emp.id && isCommissionEligible(b)).length;
    const commissionTotal = breakdown.items.filter((i) => i.label === "Booking commission").reduce((s, i) => s + i.amount, 0);
    const nightBonusItem = breakdown.items.find((i) => i.label === "Night Clean Bonus");
    const nightCleanBonus = nightBonusItem?.amount ?? 0;
    const nightCleans = nightBonusItem ? Math.round(nightCleanBonus / Math.max(1, rates.housekeepingNightBonus)) : 0;
    return {
      id: emp.id, name: emp.name, role: emp.role, teamKey: emp.teamKey,
      fixedSalary, successfulBookings, commissionPerBooking: rates.bookerCommission, commissionTotal,
      totalCleans: myCleaningLogs.length, nightCleans, nightCleanBonus,
      totalPayroll: fixedSalary + breakdown.total,
    };
  });

  const bookerRows = rows
    .filter((r) => r.role === "BOOKER")
    .sort((a, b) => b.successfulBookings - a.successfulBookings)
    .map((r, i) => ({ ...r, badge: i === 0 && r.successfulBookings > 0 ? "🏆 Top Performer" : r.successfulBookings >= 5 ? "⭐ Strong" : "" }));

  const housekeepingRows = rows.filter((r) => r.role === "HOUSEKEEPING");

  // ---- Executive summary ----
  const totalFixedSalary = rows.reduce((s, r) => s + r.fixedSalary, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commissionTotal, 0);
  const totalHousekeepingBonus = housekeepingRows.reduce((s, r) => s + r.nightCleanBonus, 0);
  const totalIncentives = totalCommission + totalHousekeepingBonus;
  const totalPayroll = totalFixedSalary + totalIncentives;
  const now = new Date();
  const totalBookingsClosed = bookings.filter((b) => !b.cancelledAt && isBookingCompleted(b as any, now)).length;

  // ---- Team performance — real Team A/B/C groups, regardless of role ----
  const totalCompanyNights = bookings.reduce((s, b) => (b.cancelledAt ? s : s + nightsFor(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null)), 0);
  const teams = Object.values(TEAMS).map((team) => {
    const memberIds = new Set(employees.filter((e) => e.teamKey === team.key).map((e) => e.id));
    const members = rows.filter((r) => memberIds.has(r.id));
    const memberBookings = bookings.filter((b) => !b.cancelledAt && b.bookerId && memberIds.has(b.bookerId));
    const successfulBookings = memberBookings.filter((b) => isCommissionEligible(b)).length;
    const revenue = memberBookings.reduce((s, b) => s + collectedAmountPesos(b), 0);
    const teamNights = memberBookings.reduce((s, b) => s + nightsFor(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null), 0);
    const occupancyContribution = totalCompanyNights > 0 ? Math.round((teamNights / totalCompanyNights) * 100) : 0;
    return {
      key: team.key, name: team.name, color: team.color, emoji: team.emoji,
      members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
      successfulBookings, revenue,
      totalPayroll: members.reduce((s, m) => s + m.totalPayroll, 0),
      totalIncentives: members.reduce((s, m) => s + m.commissionTotal + m.nightCleanBonus, 0),
      occupancyContribution,
    };
  });
  teams.sort((a, b) => b.successfulBookings - a.successfulBookings || b.revenue - a.revenue || b.occupancyContribution - a.occupancyContribution);
  const teamsRanked = teams.map((t, i) => ({ ...t, rank: i + 1, isTopTeam: i === 0 && t.successfulBookings > 0 }));

  return NextResponse.json({
    range: { start: start.toISOString(), end: end.toISOString(), rangeType, offset },
    executiveSummary: {
      totalPayroll, totalIncentives, totalFixedSalary, totalHousekeepingBonus,
      totalBookingsClosed, activeEmployees: payrollEmployees.length,
    },
    bookerPerformance: bookerRows,
    housekeepingSummary: housekeepingRows,
    teams: teamsRanked,
  });
}
