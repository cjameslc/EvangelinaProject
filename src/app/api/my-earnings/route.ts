import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { computeTeamBreakdown, isPayrollRole, weeklySalaryFor, type PayrollRates } from "@/lib/payroll";
import { isBookingCompleted, syncEliteBookerAwards, ELITE_TIERS, ELITE_CHALLENGE_ROLES } from "@/lib/gamification";
import { isCommissionEligible } from "@/lib/bookingStatus";

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function manilaWeekStart(offsetWeeks: number) {
  const [y, m, d] = dayOf(new Date()).split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - today.getUTCDay() + offsetWeeks * 7);
  return start;
}

// Seeded once per employee, on their first My Earnings fetch, if they have
// no EmployeeAchievement rows yet — preserves the original default badges
// as a starting point the owner can then edit/add to/delete from Owner
// Summary's Achievements & Rewards panel.
const DEFAULT_ACHIEVEMENTS = [
  { label: "First Booking", threshold: 1 },
  { label: "10 Bookings", threshold: 10 },
  { label: "25 Bookings", threshold: 25 },
] as const;

// Every My Earnings figure is a *derived* view over Booking/CleaningLog/
// WeeklyExpense/EliteBookerAward — there's no separate "payroll record" to
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

  const isEliteChallengeEligible = (ELITE_CHALLENGE_ROLES as readonly string[]).includes(employee.role);
  if (isEliteChallengeEligible) await syncEliteBookerAwards();

  const [allBookingsForEmployee, cleaningLogs, expenses, myAwards, myExpenseRequests] = await Promise.all([
    // No cancelledAt filter here — a cancelled booking can still be
    // commission-eligible (see isCommissionEligible: money kept, not
    // refunded), so cancelled bookings have to stay in this set. dpAmount +
    // refundedAt are selected because isCommissionEligible needs both.
    prisma.booking.findMany({
      where: { OR: [{ bookerId: employee.id }, { cleanerId: employee.id }] },
      select: { id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, stayType: true, bookerId: true, cleanerId: true, guests: true, paid: true, cancelledAt: true, dpAmount: true, refundedAt: true },
      orderBy: { date: "desc" },
    }),
    prisma.cleaningLog.findMany({ where: { employeeId: employee.id }, select: { unitId: true, startedAt: true }, orderBy: { startedAt: "desc" } }),
    prisma.weeklyExpense.findMany({ where: { targetEmployeeId: employee.id }, orderBy: { date: "desc" }, take: 200 }),
    prisma.eliteBookerAward.findMany({ where: { employeeId: employee.id }, orderBy: { completedAt: "desc" } }),
    prisma.expenseRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { unit: { select: { id: true, name: true, shortName: true } } },
    }),
  ]);

  const now = new Date();
  // "Completed" here is about the stay having actually finished — used for
  // achievements (First Booking, 10 Bookings, ...) and Housekeeping's
  // cleaning-day stats, neither of which this task touches. A cancelled
  // booking never counts as "completed" work, same as before.
  const completedBookings = allBookingsForEmployee.filter((b) => !b.cancelledAt && isBookingCompleted(b, now));
  const bookedByThisEmployee = completedBookings.filter((b) => b.bookerId === employee!.id);
  const cleanedByThisEmployee = completedBookings.filter((b) => b.cleanerId === employee!.id);
  // Commission-eligible: see isCommissionEligible — paid (no more waiting on
  // checkout), or a cancelled booking whose deposit was kept, never refunded.
  const commissionEligibleLifetime = allBookingsForEmployee.filter((b) => b.bookerId === employee!.id && isCommissionEligible(b));

  // ---- This week (matches "Your team" / Admin Staff tab exactly) ----
  const weekStart = manilaWeekStart(0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekBookingsNormalized = allBookingsForEmployee
    .filter((b) => { const d = new Date(dayOf(new Date(b.date))); return d >= weekStart && d < weekEnd; })
    .map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime, paid: b.paid, cancelledAt: b.cancelledAt?.toISOString() ?? null, dpAmount: b.dpAmount, refundedAt: b.refundedAt?.toISOString() ?? null }));
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

  // ---- This month (gross/net + Elite Booker Challenge progress) ----
  const thisMonthIso = dayOf(now).slice(0, 7);
  const monthBookings = allBookingsForEmployee.filter((b) => b.date.toISOString().slice(0, 7) === thisMonthIso);
  const cleaningDaysThisMonth = new Set(
    cleaningLogs.filter((c) => c.startedAt.toISOString().slice(0, 7) === thisMonthIso).map((c) => dayOf(new Date(c.startedAt)))
  ).size;
  const monthExpensesNormalized = expenses
    .filter((e) => e.date.toISOString().slice(0, 7) === thisMonthIso)
    .map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: employee!.id }));
  const monthBookingsNormalized = monthBookings.map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime, paid: b.paid, cancelledAt: b.cancelledAt?.toISOString() ?? null, dpAmount: b.dpAmount, refundedAt: b.refundedAt?.toISOString() ?? null }));
  const thisMonthActivity = computeTeamBreakdown(employee, {
    cleaningDays: cleaningDaysThisMonth,
    weekBookings: monthBookingsNormalized,
    weekExpenses: monthExpensesNormalized,
    rates,
    periodWeeks: 30 / 7,
  });
  const monthAwards = myAwards.filter((a) => a.month.toISOString().slice(0, 7) === thisMonthIso);
  const monthBonusTotal = monthAwards.reduce((s, a) => s + a.amount, 0);
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
  } else if (employee.role === "AUDITOR") {
    const weeksSinceCreated = Math.max(1, Math.round((now.getTime() - new Date(employee.createdAt).getTime()) / (7 * 86400000)));
    lifetimeActivity = weeksSinceCreated * rates.auditorWeeklyRate;
  }
  // Booking commission — see isCommissionEligible (paid, or cancelled with
  // the deposit kept and not refunded), regardless of role (see
  // computeTeamBreakdown for the weekly/monthly version of the same rule).
  lifetimeActivity += commissionEligibleLifetime.length * rates.bookerCommission;
  // Old flat-rate "Salary" WeeklyExpense top-ups are excluded here too, same
  // as computeTeamBreakdown's weekly/monthly figures — only real deductions
  // (ad boosts, etc.) still count against lifetime earnings.
  const lifetimeAdjustments = expenses.filter((e) => e.note !== "Salary").reduce((s, e) => s - e.amount, 0);
  const lifetimeBonusTotal = myAwards.reduce((s, a) => s + a.amount, 0);

  // ---- Monthly Elite Booker Challenge progress — shared as-is by anyone
  // eligible (Booker, or Housekeeping staff who also take bookings), same
  // tiers/rewards/slot pool for everyone in it. ----
  let eliteChallenge: any = null;
  if (isEliteChallengeEligible) {
    // Elite tier progress stays checked-out/not-cancelled gated (unchanged
    // scope — a separate reward system from the flat ₱/booking commission).
    // estimatedCommission below is the one figure on this card that IS the
    // real commission rule, so it has to use isCommissionEligible instead or
    // it'd silently disagree with thisMonthActivity.total above.
    const completedThisMonth = monthBookings.filter((b) => b.bookerId === employee!.id && !b.cancelledAt && isBookingCompleted(b, now)).length;
    const commissionEligibleThisMonth = monthBookings.filter((b) => b.bookerId === employee!.id && isCommissionEligible(b)).length;

    // Everyone else's counts + awards this month, to compute rank and
    // remaining slots per tier without exposing their identities beyond
    // what's already public on the admin leaderboard.
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    // allMonthAwards doesn't depend on allBookers, so it runs alongside that
    // chain instead of after it.
    const [allBookers, allMonthAwards] = await Promise.all([
      prisma.employee.findMany({ where: { role: { in: [...ELITE_CHALLENGE_ROLES] }, active: true }, select: { id: true } }),
      prisma.eliteBookerAward.findMany({ where: { month: monthStart } }),
    ]);
    const allMonthBookings = await prisma.booking.findMany({
      where: { bookerId: { in: allBookers.map((b) => b.id) }, date: { gte: monthStart, lt: nextMonthStart }, cancelledAt: null },
      select: { bookerId: true, date: true, checkOutDate: true },
    });
    const countsByBooker = new Map<string, number>();
    allBookers.forEach((b) => countsByBooker.set(b.id, 0));
    allMonthBookings.forEach((b) => { if (b.bookerId && isBookingCompleted(b, now)) countsByBooker.set(b.bookerId, (countsByBooker.get(b.bookerId) ?? 0) + 1); });
    const ranked = [...countsByBooker.entries()].sort((a, b) => b[1] - a[1]);
    const rank = ranked.findIndex(([id]) => id === employee!.id) + 1;

    const currentTierDef = [...ELITE_TIERS].reverse().find((t) => completedThisMonth >= t.tier) ?? null;
    const nextTierDef = ELITE_TIERS.find((t) => completedThisMonth < t.tier) ?? null;
    const tiersWithSlots = ELITE_TIERS.map((t) => ({
      tier: t.tier,
      amount: t.amount,
      stars: t.stars,
      badge: t.badge,
      medal: t.medal,
      slotsTotal: t.slots,
      slotsTaken: allMonthAwards.filter((a) => a.tier === t.tier).length,
      wonByMe: monthAwards.some((a) => a.tier === t.tier),
    }));
    const nextTierSlots = nextTierDef ? tiersWithSlots.find((t) => t.tier === nextTierDef.tier)! : null;

    eliteChallenge = {
      completedThisMonth,
      rank,
      totalBookers: ranked.length,
      currentTier: currentTierDef?.tier ?? null,
      currentStars: currentTierDef?.stars ?? 0,
      currentBadge: currentTierDef?.badge ?? null,
      nextTier: nextTierDef?.tier ?? null,
      nextTierAmount: nextTierDef?.amount ?? null,
      remaining: nextTierDef ? nextTierDef.tier - completedThisMonth : 0,
      progressPct: nextTierDef ? Math.min(100, Math.round((completedThisMonth / nextTierDef.tier) * 100)) : 100,
      slotsRemainingForNextTier: nextTierSlots ? Math.max(0, nextTierSlots.slotsTotal - nextTierSlots.slotsTaken) : 0,
      slotsTotalForNextTier: nextTierSlots?.slotsTotal ?? 0,
      estimatedCommission: commissionEligibleThisMonth * rates.bookerCommission,
      potentialBonus: nextTierDef?.amount ?? 0,
      tiers: tiersWithSlots,
    };
  }

  // ---- Achievements (owner-configurable per employee; "unlocked" is
  // derived live against real lifetime activity, never stored — same as
  // the Elite tier badges below. A reward, once unlocked, adds to lifetime
  // earnings; the personal message is only ever revealed once actually
  // unlocked, never spoiled early.) ----
  const lifetimeCompletedCount = employee.role === "HOUSEKEEPING" ? cleanedByThisEmployee.length : bookedByThisEmployee.length;
  let employeeAchievementDefs = await prisma.employeeAchievement.findMany({ where: { employeeId: employee.id }, orderBy: { threshold: "asc" } });
  if (employeeAchievementDefs.length === 0) {
    for (const def of DEFAULT_ACHIEVEMENTS) {
      await prisma.employeeAchievement.create({ data: { employeeId: employee.id, label: def.label, threshold: def.threshold } });
    }
    employeeAchievementDefs = await prisma.employeeAchievement.findMany({ where: { employeeId: employee.id }, orderBy: { threshold: "asc" } });
  }
  const achievementResults = employeeAchievementDefs.map((a) => {
    const unlocked = lifetimeCompletedCount >= a.threshold;
    return { id: a.id, label: a.label, threshold: a.threshold, rewardAmount: a.rewardAmount, unlocked, personalMessage: unlocked ? a.personalMessage : null };
  });
  const unlockedAchievementRewardTotal = achievementResults.filter((a) => a.unlocked).reduce((s, a) => s + a.rewardAmount, 0);
  const eliteTierBadges = isEliteChallengeEligible ? ELITE_TIERS : [];
  const achievements = [
    ...achievementResults,
    ...eliteTierBadges.map((t) => ({ id: `tier-${t.tier}`, label: `${t.medal} ${t.badge}`, unlocked: myAwards.some((a) => a.tier === t.tier) })),
  ];
  const lifetimeEarnings = lifetimeActivity + lifetimeAdjustments + lifetimeBonusTotal + unlockedAchievementRewardTotal;

  // ---- Payroll history: last 10 weeks ----
  const payrollHistory = [];
  for (let i = 0; i < 10; i++) {
    const wStart = manilaWeekStart(-i);
    const wEnd = new Date(wStart);
    wEnd.setUTCDate(wEnd.getUTCDate() + 7);
    const wBookings = allBookingsForEmployee
      .filter((b) => { const d = new Date(dayOf(new Date(b.date))); return d >= wStart && d < wEnd; })
      .map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime, paid: b.paid, cancelledAt: b.cancelledAt?.toISOString() ?? null, dpAmount: b.dpAmount, refundedAt: b.refundedAt?.toISOString() ?? null }));
    const wCleaningDays = new Set(
      cleaningLogs.filter((c) => { const d = new Date(dayOf(new Date(c.startedAt))); return d >= wStart && d < wEnd; }).map((c) => dayOf(new Date(c.startedAt)))
    ).size;
    const wExpenses = expenses
      .filter((e) => { const d = new Date(dayOf(new Date(e.date))); return d >= wStart && d < wEnd; })
      .map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: employee!.id }));
    const wActivity = computeTeamBreakdown(employee, { cleaningDays: wCleaningDays, weekBookings: wBookings, weekExpenses: wExpenses, rates });
    const wAwards = myAwards.filter((a) => { const d = new Date(a.completedAt); return d >= wStart && d < wEnd; });
    const wSalary = weeklySalaryFor(employee.monthlySalary);
    payrollHistory.push({
      weekStart: wStart.toISOString(),
      weekEnd: new Date(wEnd.getTime() - 86400000).toISOString(),
      salary: wSalary,
      activity: wActivity.total,
      bookingCount: wBookings.filter((b) => b.bookerId === employee!.id && isCommissionEligible(b)).length,
      bonuses: wAwards.reduce((s, a) => s + a.amount, 0),
      total: wSalary + wActivity.total + wAwards.reduce((s, a) => s + a.amount, 0),
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
    eliteChallenge,
    achievements,
    payrollHistory,
    bonusAwards: myAwards.map((a) => ({ id: a.id, month: a.month.toISOString(), tier: a.tier, amount: a.amount, slotRank: a.slotRank, completedAt: a.completedAt.toISOString() })),
    adjustments: expenses.slice(0, 30).map((e) => ({ id: e.id, date: e.date.toISOString(), amount: e.amount, note: e.note, deduction: e.note !== "Salary" })),
    expenseRequests: myExpenseRequests.map((r) => ({
      id: r.id, category: r.category, amount: r.amount, note: r.note, date: r.date.toISOString(), status: r.status,
      rejectionReason: r.rejectionReason, unit: r.unit ? { id: r.unit.id, name: r.unit.name, shortName: r.unit.shortName } : null,
      receiptUrl: r.receiptUrl,
    })),
  });
}
