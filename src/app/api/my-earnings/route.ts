import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma, prismaPool } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { computeTeamBreakdown, isPayrollRole, weeklySalaryFor, type PayrollRates } from "@/lib/payroll";
import { isBookingCompleted, syncEliteBookerAwards, ELITE_TIERS, ELITE_CHALLENGE_ROLES } from "@/lib/gamification";
import { isCommissionEligible } from "@/lib/bookingStatus";
import { periodRangeFor, type AnalyticsPeriodType } from "@/lib/analytics/period";
import { collectedAmountPesos } from "@/lib/finance";

// The Elite Challenge company-wide ranking data (every eligible booker's
// bookings + awards this month) is identical for every viewer — same idea
// as src/app/api/leaderboard/route.ts's getRankedLeaderboard, cached the
// same way (45s) instead of re-querying the whole company's bookings on
// every single My Earnings page load. isBookingCompleted itself is still
// evaluated live per-request below (not cached), so this only removes
// redundant round trips — it introduces no new staleness beyond what the
// already-shipped leaderboard endpoint has had all along.
type EliteChallengeMonthData = {
  allBookers: { id: string }[];
  allMonthAwards: { tier: number; employeeId: string }[];
  allMonthBookings: { bookerId: string | null; date: string; checkOutDate: string | null }[];
};

const getEliteChallengeMonthData = unstable_cache(
  async (monthStartIso: string, nextMonthStartIso: string): Promise<EliteChallengeMonthData> => {
    const monthStart = new Date(monthStartIso);
    const nextMonthStart = new Date(nextMonthStartIso);
    const [allBookers, allMonthAwards] = await Promise.all([
      prisma.employee.findMany({ where: { role: { in: [...ELITE_CHALLENGE_ROLES] }, active: true }, select: { id: true } }),
      prisma.eliteBookerAward.findMany({ where: { month: monthStart } }),
    ]);
    const allMonthBookings = await prisma.booking.findMany({
      where: { bookerId: { in: allBookers.map((b) => b.id) }, date: { gte: monthStart, lt: nextMonthStart }, cancelledAt: null },
      select: { bookerId: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true, stayType: true, platform: true },
    });
    return JSON.parse(JSON.stringify({ allBookers, allMonthAwards, allMonthBookings }));
  },
  ["elite-challenge-month-data"],
  { revalidate: 45 }
);

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

  // Range filter for the Successful Bookings / Night Clean Bonus tables
  // only — defaults to "this week" (the tables' own previous scope was
  // "lifetime"/"this month" respectively; now both start at this week and
  // the viewer can widen it). Every other figure on this page (pending
  // payroll, gross/net this month, lifetime earnings, Elite Challenge) is
  // intentionally untouched by this filter — those already have their own
  // fixed weekly/monthly meaning baked into their labels.
  const sp = req.nextUrl.searchParams;
  const tableRangeType = (sp.get("rangeType") ?? "weekly") as AnalyticsPeriodType;
  const tableOffset = Number(sp.get("offset") ?? "0");
  const tableCustomStart = sp.get("start") ?? undefined;
  const tableCustomEnd = sp.get("end") ?? undefined;
  const tableRange = periodRangeFor(tableRangeType, tableOffset, tableCustomStart && tableCustomEnd ? { start: tableCustomStart, end: tableCustomEnd } : undefined);

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

  // Spread across the read pool (not the single shared `prisma` client) —
  // the libSQL adapter serializes queries on one client behind an internal
  // mutex, so a Promise.all on `prisma` alone gets none of the real
  // concurrency this pool exists to provide (see src/lib/prisma.ts). Every
  // query below — including the HOUSEKEEPING portfolio data and the Team
  // roster/bookings — is fired in this one Promise.all rather than awaited
  // one after another, so switching between employees (Owner Summary's
  // picker) never stacks up multiple sequential round trips against the
  // remote Turso DB.
  const monthStartForTeam = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [
    allBookingsForEmployee, cleaningLogs, expenses, myAwards, myExpenseRequests,
    activeUnitCount, portfolioHousekeepingBookings,
    teammates, teamBookingsThisMonth,
  ] = await Promise.all([
    // No cancelledAt filter here — a cancelled booking can still be
    // commission-eligible (see isCommissionEligible: money kept, not
    // refunded), so cancelled bookings have to stay in this set. dpAmount +
    // refundedAt are selected because isCommissionEligible needs both.
    prismaPool[0].booking.findMany({
      where: { OR: [{ bookerId: employee.id }, { cleanerId: employee.id }] },
      select: {
        id: true, unitId: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true, stayType: true, platform: true, bookerId: true, cleanerId: true, paid: true, cancelledAt: true, dpAmount: true, refundedAt: true,
        guests: true, unit: { select: { shortName: true, unitNumber: true } },
      },
      orderBy: { date: "desc" },
    }),
    prismaPool[1].cleaningLog.findMany({ where: { employeeId: employee.id }, select: { unitId: true, startedAt: true }, orderBy: { startedAt: "desc" } }),
    prismaPool[2].weeklyExpense.findMany({ where: { targetEmployeeId: employee.id }, orderBy: { date: "desc" }, take: 200 }),
    prismaPool[3].eliteBookerAward.findMany({ where: { employeeId: employee.id }, orderBy: { completedAt: "desc" } }),
    prismaPool[4].expenseRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { unit: { select: { id: true, name: true, shortName: true } } },
    }),
    // Portfolio-wide housekeeping data — needed only for HOUSEKEEPING staff,
    // to compute the real Night Clean Bonus rule (total cleanings that day,
    // across every housekeeping employee, vs. total active units — see
    // computeTeamBreakdown's portfolioBookings/totalUnits params).
    employee.role === "HOUSEKEEPING" ? prismaPool[5].unit.count({ where: { active: true } }) : Promise.resolve(0),
    // A 40-day lookback comfortably covers "this week"/"this month" for the
    // payroll figures; also stretched back to tableRange.start so the Night
    // Clean Bonus table's own range filter (Last Month/Custom Range can
    // reach further back) is fully covered by this one query too.
    employee.role === "HOUSEKEEPING"
      ? prismaPool[6].booking.findMany({
          where: { cleanerId: { not: null }, date: { gte: new Date(Math.min(Date.now() - 40 * 86400000, tableRange.start.getTime())) } },
          select: { unitId: true, cleanerId: true, date: true, checkOutDate: true, checkOutTime: true, checkInTime: true, cancelledAt: true },
        })
      : Promise.resolve([]),
    // This employee's real Team A/B/C group (Employee.teamKey) — roster plus
    // this month's real activity for the team as a whole, not the old
    // role-based Booking/Housekeeping/Operations display split.
    employee.teamKey ? prismaPool[7].employee.findMany({ where: { teamKey: employee.teamKey, active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    employee.teamKey
      ? prismaPool[8].booking.findMany({
          where: { date: { gte: monthStartForTeam } },
          select: { bookerId: true, paid: true, amount: true, dpAmount: true, refundedAt: true, cancelledAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Team stats are computed here (no more awaits) — teamBookingsThisMonth is
  // fetched company-wide above (parallel-safe, no dependency on teammates
  // resolving first) and filtered down to this employee's actual teammates.
  let team: any = null;
  if (employee.teamKey && teammates.length > 0) {
    const teammateIds = new Set(teammates.map((t) => t.id));
    const teamBookings = teamBookingsThisMonth.filter((b) => b.bookerId && teammateIds.has(b.bookerId));
    const successfulBookings = teamBookings.filter((b) => isCommissionEligible(b)).length;
    const revenue = teamBookings.reduce((s, b) => s + collectedAmountPesos(b), 0);
    team = {
      key: employee.teamKey,
      members: teammates.map((t) => ({ id: t.id, name: t.name, role: t.role })),
      statsThisMonth: { successfulBookings, revenue },
    };
  }

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

  // Company-wide cleanings (every housekeeping employee, not just this one)
  // — computeTeamBreakdown's portfolioBookings only reads cancelledAt/
  // cleanerId/checkOutDate/date/checkOutTime, so the other NormalizedBooking
  // fields below are unused placeholders, not real data.
  const portfolioNormalized = portfolioHousekeepingBookings.map((b) => ({
    bookerId: null as string | null, cleanerId: b.cleanerId, unitId: b.unitId, stayType: "Night", paid: true,
    date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime, checkInTime: b.checkInTime,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
  }));
  const portfolioThisWeek = portfolioNormalized.filter((b) => { const d = new Date(dayOf(new Date(b.date))); return d >= weekStart && d < weekEnd; });
  const weekBookingsNormalized = allBookingsForEmployee
    .filter((b) => { const d = new Date(dayOf(new Date(b.date))); return d >= weekStart && d < weekEnd; })
    .map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime, paid: b.paid, cancelledAt: b.cancelledAt?.toISOString() ?? null, dpAmount: b.dpAmount, refundedAt: b.refundedAt?.toISOString() ?? null }));
  const cleaningDaysThisWeek = new Set(
    cleaningLogs.filter((c) => { const d = new Date(dayOf(new Date(c.startedAt))); return d >= weekStart && d < weekEnd; }).map((c) => dayOf(new Date(c.startedAt)))
  ).size;
  const weekExpensesNormalized = expenses
    .filter((e) => { const d = new Date(dayOf(new Date(e.date))); return d >= weekStart && d < weekEnd; })
    .map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: employee!.id }));
  // Only APPROVED requests count toward real earnings — a still-pending or
  // rejected request isn't money owed yet, same as a WeeklyExpense or
  // booking commission never counts before it's actually earned/approved.
  const weekExpenseRequestsNormalized = myExpenseRequests
    .filter((r) => r.status === "APPROVED" && (() => { const d = new Date(dayOf(new Date(r.date))); return d >= weekStart && d < weekEnd; })())
    .map((r) => ({ employeeId: employee!.id, note: r.note, amount: r.amount }));
  const thisWeek = computeTeamBreakdown(employee, {
    cleaningDays: cleaningDaysThisWeek,
    weekBookings: weekBookingsNormalized,
    weekExpenses: weekExpensesNormalized,
    weekExpenseRequests: weekExpenseRequestsNormalized,
    rates,
    portfolioBookings: employee.role === "HOUSEKEEPING" ? portfolioThisWeek : undefined,
    totalUnits: employee.role === "HOUSEKEEPING" ? activeUnitCount : undefined,
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
  const monthExpenseRequestsNormalized = myExpenseRequests
    .filter((r) => r.status === "APPROVED" && r.date.toISOString().slice(0, 7) === thisMonthIso)
    .map((r) => ({ employeeId: employee!.id, note: r.note, amount: r.amount }));
  const monthBookingsNormalized = monthBookings.map((b) => ({ bookerId: b.bookerId, cleanerId: b.cleanerId, unitId: b.unitId, stayType: b.stayType, date: b.date.toISOString(), checkOutDate: b.checkOutDate?.toISOString() ?? null, checkOutTime: b.checkOutTime, paid: b.paid, cancelledAt: b.cancelledAt?.toISOString() ?? null, dpAmount: b.dpAmount, refundedAt: b.refundedAt?.toISOString() ?? null }));
  const portfolioThisMonth = portfolioNormalized.filter((b) => b.date.slice(0, 7) === thisMonthIso);
  const thisMonthActivity = computeTeamBreakdown(employee, {
    cleaningDays: cleaningDaysThisMonth,
    weekBookings: monthBookingsNormalized,
    weekExpenses: monthExpensesNormalized,
    weekExpenseRequests: monthExpenseRequestsNormalized,
    rates,
    periodWeeks: 30 / 7,
    portfolioBookings: employee.role === "HOUSEKEEPING" ? portfolioThisMonth : undefined,
    totalUnits: employee.role === "HOUSEKEEPING" ? activeUnitCount : undefined,
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
    const { allBookers, allMonthAwards, allMonthBookings } = await getEliteChallengeMonthData(monthStart.toISOString(), nextMonthStart.toISOString());
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
    const wExpenseRequests = myExpenseRequests
      .filter((r) => r.status === "APPROVED" && (() => { const d = new Date(dayOf(new Date(r.date))); return d >= wStart && d < wEnd; })())
      .map((r) => ({ employeeId: employee!.id, note: r.note, amount: r.amount }));
    const wActivity = computeTeamBreakdown(employee, { cleaningDays: wCleaningDays, weekBookings: wBookings, weekExpenses: wExpenses, weekExpenseRequests: wExpenseRequests, rates });
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

  // ---- Successful Bookings table (Bookers) — every commission-eligible
  // booking this employee logged within the selected range (defaults to
  // this week), most recent first. ----
  const successfulBookings = employee.role === "BOOKER"
    ? commissionEligibleLifetime
        .filter((b) => b.date >= tableRange.start && b.date < tableRange.end)
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map((b) => ({
          id: b.id,
          guestName: (b.guests as string[])[0] ?? "Guest",
          unit: b.unit ? (b.unit.shortName || b.unit.unitNumber) : b.unitId,
          date: b.date.toISOString(),
          commissionEarned: rates.bookerCommission,
          status: b.cancelledAt ? "Cancelled (deposit kept)" : b.paid ? "Paid" : "Pending",
        }))
    : [];

  // ---- Night Clean Bonus table (Housekeeping) — cleanings within the
  // selected range (defaults to this week), itemized with the same
  // eligibility rule computeTeamBreakdown applies in aggregate above, so
  // the per-row math and the total always agree for the same range. ----
  let nightCleanBonusRows: any[] = [];
  if (employee.role === "HOUSEKEEPING") {
    const portfolioForTableRange = portfolioNormalized.filter((b) => {
      const d = new Date(b.date);
      return d >= tableRange.start && d < tableRange.end;
    });
    const allCleaningsByDayRange = new Map<string, number>();
    for (const b of portfolioForTableRange) {
      if (b.cancelledAt || !b.cleanerId) continue;
      const day = (b.checkOutDate ?? b.date).slice(0, 10);
      allCleaningsByDayRange.set(day, (allCleaningsByDayRange.get(day) ?? 0) + 1);
    }
    const remainingExtraByDay = new Map<string, number>();
    for (const [day, count] of allCleaningsByDayRange) remainingExtraByDay.set(day, Math.max(0, count - activeUnitCount));
    const myRangeCleaned = allBookingsForEmployee
      .filter((b) => b.cleanerId === employee!.id && !b.cancelledAt && b.date >= tableRange.start && b.date < tableRange.end)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    nightCleanBonusRows = myRangeCleaned.map((b) => {
      const day = (b.checkOutDate ?? b.date).toISOString().slice(0, 10);
      const additionalCleaningCount = Math.max(0, (allCleaningsByDayRange.get(day) ?? 0) - activeUnitCount);
      const isLateCheckIn = !!b.checkInTime && b.checkInTime >= "17:00";
      const remaining = remainingExtraByDay.get(day) ?? 0;
      const qualified = isLateCheckIn && remaining > 0;
      if (qualified) remainingExtraByDay.set(day, remaining - 1);
      return {
        bookingId: b.id,
        unit: b.unit ? (b.unit.shortName || b.unit.unitNumber) : b.unitId,
        checkInTime: b.checkInTime,
        additionalCleaningCount,
        bonus: qualified ? rates.housekeepingNightBonus : 0,
        qualified,
        status: qualified ? "Eligible" : !isLateCheckIn ? "Not eligible — check-in before 5PM" : "Not eligible — no additional cleaning that day",
      };
    });
  }

  return NextResponse.json({
    employee: {
      id: employee.id, name: employee.name, role: employee.role, salaryType: employee.salaryType, salaryRate: employee.salaryRate, monthlySalary: employee.monthlySalary,
      fixedSalaryCoversCleaning: employee.fixedSalaryCoversCleaning,
    },
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
    team,
    successfulBookings,
    nightCleanBonusRows,
  });
}
