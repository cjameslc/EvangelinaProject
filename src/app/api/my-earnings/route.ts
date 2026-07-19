import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { computeTeamBreakdown, isPayrollRole, weeklySalaryFor, type PayrollRates } from "@/lib/payroll";
import { isBookingCompleted, syncBookerBonusAwards, BONUS_TIERS } from "@/lib/gamification";

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function manilaWeekStart(offsetWeeks: number) {
  const [y, m, d] = dayOf(new Date()).split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - today.getUTCDay() + offsetWeeks * 7);
  return start;
}

const ACHIEVEMENT_DEFS = [
  { id: "first-booking", label: "First Booking", min: 1 },
  { id: "ten-bookings", label: "10 Bookings", min: 10 },
  { id: "twentyfive-bookings", label: "25 Bookings", min: 25 },
] as const;

// Every My Earnings figure is a *derived* view over Booking/CleaningLog/
// WeeklyExpense/BookerBonusAward — there's no separate "payroll record" to
// go stale, so every read here is automatically live/recalculated; nothing
// needs an explicit recompute trigger when a booking is edited or cancelled.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const requestedEmployeeId = req.nextUrl.searchParams.get("employeeId");
  const isAdminViewer = user.role === "OWNER_ADMIN" || user.role === "CO_OWNER";

  // Resolve which Employee record we're reporting on. A non-admin may only
  // ever see their own linked record — this is enforced here, not just in
  // the UI, so it can't be bypassed via the URL/API directly.
  let employee;
  if (requestedEmployeeId) {
    if (!isAdminViewer) {
      const own = await prisma.employee.findUnique({ where: { userId: user.id } });
      if (!own || own.id !== requestedEmployeeId) return new Response("Forbidden", { status: 403 });
    }
    employee = await prisma.employee.findUnique({ where: { id: requestedEmployeeId } });
  } else {
    employee = await prisma.employee.findUnique({ where: { userId: user.id } });
  }

  if (!employee) return NextResponse.json({ error: "No staff record linked to this account." }, { status: 404 });
  if (!isPayrollRole(employee.role)) {
    return NextResponse.json({ error: "Owners and Co-owners are not part of payroll.", employee: { id: employee.id, name: employee.name, role: employee.role } }, { status: 200 });
  }

  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const rates: PayrollRates = {
    housekeepingDayRate: settings.housekeepingDayRate,
    housekeepingNightBonus: settings.housekeepingNightBonus,
    bookerCommission: settings.bookerCommission,
    auditorWeeklyRate: settings.auditorWeeklyRate,
  };

  if (employee.role === "BOOKER") await syncBookerBonusAwards(employee.id);

  const [units, allBookingsForEmployee, cleaningLogs, expenses, bonusAwards] = await Promise.all([
    prisma.unit.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, shortName: true, unitNumber: true } }),
    prisma.booking.findMany({
      where: { OR: [{ bookerId: employee.id }, { cleanerId: employee.id }] },
      select: { id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, stayType: true, bookerId: true, cleanerId: true, guests: true },
      orderBy: { date: "desc" },
    }),
    prisma.cleaningLog.findMany({ where: { employeeId: employee.id }, select: { unitId: true, startedAt: true }, orderBy: { startedAt: "desc" } }),
    prisma.weeklyExpense.findMany({ where: { targetEmployeeId: employee.id }, orderBy: { date: "desc" }, take: 200 }),
    prisma.bookerBonusAward.findMany({ where: { employeeId: employee.id }, include: { unit: { select: { shortName: true } } }, orderBy: { awardedAt: "desc" } }),
  ]);

  const now = new Date();
  const completedBookings = allBookingsForEmployee.filter((b) => isBookingCompleted(b, now));
  const bookedByThisEmployee = completedBookings.filter((b) => b.bookerId === employee!.id);
  const cleanedByThisEmployee = completedBookings.filter((b) => b.cleanerId === employee!.id);

  // ---- This week (matches "Your team" / Admin Staff tab exactly) ----
  const weekStart = manilaWeekStart(0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekBookingsNormalized = allBookingsForEmployee
    .filter((b) => { const d = new Date(dayOf(new Date(b.date))); return d >= weekStart && d < weekEnd; })
    .map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime }));
  const cleaningDaysThisWeek = new Set(
    cleaningLogs.filter((c) => { const d = new Date(dayOf(new Date(c.startedAt))); return d >= weekStart && d < weekEnd; }).map((c) => dayOf(new Date(c.startedAt)))
  ).size;
  const weekExpensesNormalized = expenses
    .filter((e) => { const d = new Date(dayOf(new Date(e.date))); return d >= weekStart && d < weekEnd; })
    .map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: employee!.id }));
  const thisWeek = computeTeamBreakdown(employee, {
    cleaningDays: cleaningDaysThisWeek,
    weekBookings: weekBookingsNormalized,
    weekExpenses: weekExpensesNormalized,
    rates,
  });
  const salaryThisWeek = weeklySalaryFor(employee.monthlySalary);
  const pendingPayroll = salaryThisWeek + thisWeek.total;

  // ---- This month (gross/net + per-unit gamification progress) ----
  const thisMonthIso = dayOf(now).slice(0, 7);
  const monthBookings = allBookingsForEmployee.filter((b) => b.date.toISOString().slice(0, 7) === thisMonthIso);
  const cleaningDaysThisMonth = new Set(
    cleaningLogs.filter((c) => c.startedAt.toISOString().slice(0, 7) === thisMonthIso).map((c) => dayOf(new Date(c.startedAt)))
  ).size;
  const monthExpensesNormalized = expenses
    .filter((e) => e.date.toISOString().slice(0, 7) === thisMonthIso)
    .map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: employee!.id }));
  const monthBookingsNormalized = monthBookings.map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime }));
  const thisMonthActivity = computeTeamBreakdown(employee, {
    cleaningDays: cleaningDaysThisMonth,
    weekBookings: monthBookingsNormalized,
    weekExpenses: monthExpensesNormalized,
    rates,
    periodWeeks: 30 / 7,
  });
  const monthBonusAwards = bonusAwards.filter((a) => a.month.toISOString().slice(0, 7) === thisMonthIso);
  const monthBonusTotal = monthBonusAwards.reduce((s, a) => s + a.amount, 0);
  const grossThisMonth = employee.monthlySalary + thisMonthActivity.total + monthBonusTotal;
  const netThisMonth = grossThisMonth; // deductions are already netted into thisMonthActivity.total via computeTeamBreakdown

  // ---- Lifetime earnings (approximate — uses the employee's *current*
  // rate applied to all-time activity counts, not a historically-exact
  // week-by-week replay, which would be prohibitively expensive to compute
  // on every page load for an account that's been active a long time). ----
  let lifetimeActivity = 0;
  if (employee.role === "HOUSEKEEPING") {
    const allCleaningDays = new Set(cleaningLogs.map((c) => dayOf(new Date(c.startedAt)))).size;
    const eveningByUnitDay = new Map<string, number>();
    cleanedByThisEmployee.filter((b) => b.checkOutTime && b.checkOutTime >= "17:00").forEach((b) => {
      const day = (b.checkOutDate ?? b.date).toISOString().slice(0, 10);
      const key = `${b.unitId}::${day}`;
      eveningByUnitDay.set(key, (eveningByUnitDay.get(key) ?? 0) + 1);
    });
    const incentiveDays = [...eveningByUnitDay.values()].filter((n) => n >= 2).length;
    lifetimeActivity = allCleaningDays * rates.housekeepingDayRate + incentiveDays * rates.housekeepingNightBonus;
  } else if (employee.role === "BOOKER") {
    lifetimeActivity = bookedByThisEmployee.length * rates.bookerCommission;
  } else if (employee.role === "AUDITOR") {
    const weeksSinceCreated = Math.max(1, Math.round((now.getTime() - new Date(employee.createdAt).getTime()) / (7 * 86400000)));
    lifetimeActivity = weeksSinceCreated * rates.auditorWeeklyRate;
  }
  const lifetimeAdjustments = expenses.reduce((s, e) => s + (e.note === "Salary" ? e.amount : -e.amount), 0);
  const lifetimeBonusTotal = bonusAwards.reduce((s, a) => s + a.amount, 0);
  const lifetimeEarnings = lifetimeActivity + lifetimeAdjustments + lifetimeBonusTotal;

  // ---- Per-unit gamification progress (Booker only) ----
  let perUnitProgress: any[] = [];
  if (employee.role === "BOOKER") {
    const countsThisMonthByUnit = new Map<string, number>();
    monthBookings.filter((b) => b.bookerId === employee!.id).forEach((b) => {
      countsThisMonthByUnit.set(b.unitId, (countsThisMonthByUnit.get(b.unitId) ?? 0) + 1);
    });
    perUnitProgress = units
      .map((u) => {
        const completed = countsThisMonthByUnit.get(u.id) ?? 0;
        const nextTier = BONUS_TIERS.find((t) => completed < t.tier);
        const awardedTiers = monthBonusAwards.filter((a) => a.unitId === u.id).map((a) => a.tier);
        return {
          unitId: u.id,
          unitName: u.shortName,
          unitNumber: u.unitNumber,
          completedThisMonth: completed,
          nextTier: nextTier?.tier ?? null,
          nextTierAmount: nextTier?.amount ?? null,
          remaining: nextTier ? nextTier.tier - completed : 0,
          progressPct: nextTier ? Math.min(100, Math.round((completed / nextTier.tier) * 100)) : 100,
          tiersAwardedThisMonth: awardedTiers,
        };
      })
      .filter((p) => p.completedThisMonth > 0 || p.tiersAwardedThisMonth.length > 0)
      .sort((a, b) => b.completedThisMonth - a.completedThisMonth);
  }

  // ---- Achievements (derived, not persisted) ----
  const lifetimeCompletedCount = employee.role === "HOUSEKEEPING" ? cleanedByThisEmployee.length : bookedByThisEmployee.length;
  const achievements = [
    ...ACHIEVEMENT_DEFS.map((a) => ({ id: a.id, label: a.label, unlocked: lifetimeCompletedCount >= a.min })),
    { id: "fifty-bonus", label: "50 Booking Bonus", unlocked: bonusAwards.some((a) => a.tier === 50) },
    { id: "sixty-elite", label: "60 Booking Elite", unlocked: bonusAwards.some((a) => a.tier === 60) },
  ];

  // ---- Payroll history: last 12 weeks ----
  const payrollHistory = [];
  for (let i = 0; i < 12; i++) {
    const wStart = manilaWeekStart(-i);
    const wEnd = new Date(wStart);
    wEnd.setUTCDate(wEnd.getUTCDate() + 7);
    const wBookings = allBookingsForEmployee
      .filter((b) => { const d = new Date(dayOf(new Date(b.date))); return d >= wStart && d < wEnd; })
      .map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime }));
    const wCleaningDays = new Set(
      cleaningLogs.filter((c) => { const d = new Date(dayOf(new Date(c.startedAt))); return d >= wStart && d < wEnd; }).map((c) => dayOf(new Date(c.startedAt)))
    ).size;
    const wExpenses = expenses
      .filter((e) => { const d = new Date(dayOf(new Date(e.date))); return d >= wStart && d < wEnd; })
      .map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: employee!.id }));
    const wActivity = computeTeamBreakdown(employee, { cleaningDays: wCleaningDays, weekBookings: wBookings, weekExpenses: wExpenses, rates });
    const wBonuses = bonusAwards.filter((a) => { const d = new Date(a.awardedAt); return d >= wStart && d < wEnd; });
    const wSalary = weeklySalaryFor(employee.monthlySalary);
    payrollHistory.push({
      weekStart: wStart.toISOString(),
      weekEnd: new Date(wEnd.getTime() - 86400000).toISOString(),
      salary: wSalary,
      activity: wActivity.total,
      bookingCount: wBookings.filter((b) => b.bookerId === employee!.id).length,
      bonuses: wBonuses.reduce((s, a) => s + a.amount, 0),
      total: wSalary + wActivity.total + wBonuses.reduce((s, a) => s + a.amount, 0),
      status: i === 0 ? "Current period" : "Historical",
    });
  }

  // Next payroll date: last day of the month for Monthly-salaried staff,
  // else the upcoming Sunday (end of the current week).
  const upcomingPayrollDate = employee.salaryType === "MONTHLY"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString()
    : weekEnd.toISOString();

  return NextResponse.json({
    employee: { id: employee.id, name: employee.name, role: employee.role, salaryType: employee.salaryType, salaryRate: employee.salaryRate, monthlySalary: employee.monthlySalary },
    salaryThisWeek,
    thisWeek,
    pendingPayroll,
    upcomingPayrollDate,
    grossThisMonth,
    netThisMonth,
    lifetimeEarnings,
    perUnitProgress,
    achievements,
    payrollHistory,
    bonusAwards: bonusAwards.map((a) => ({ id: a.id, unitName: a.unit.shortName, month: a.month.toISOString(), tier: a.tier, amount: a.amount, awardedAt: a.awardedAt.toISOString() })),
    adjustments: expenses.slice(0, 30).map((e) => ({ id: e.id, date: e.date.toISOString(), amount: e.amount, note: e.note, deduction: e.note !== "Salary" })),
  });
}
