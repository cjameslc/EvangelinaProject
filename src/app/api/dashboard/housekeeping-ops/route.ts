import { NextResponse } from "next/server";
import { prismaPool } from "@/lib/prisma";
import { requireUser, dashboardUnitWhere } from "@/lib/session";

// Same outlier guard as minutesLate() in
// src/app/api/housekeeping/unit/[id]/route.ts — a handful of legacy/
// mis-paired CleaningLog↔Booking rows produce multi-day "delays" that
// would otherwise drag Avg Delay into meaningless territory.
const MAX_PLAUSIBLE_LATE_MS = 24 * 3600 * 1000;

// A real cleaning session (startedAt -> endedAt) is never anywhere near
// this long — a handful of rows where a housekeeper started a clean and
// never (or very late) marked it done otherwise drag Avg/Fastest/Longest
// into implausible territory (a confirmed real example: "Avg 5h 35m" next
// to "Longest 30h 3m", both dragged up by exactly this kind of stale-
// started row). Excluded from every duration figure below — a session this
// long isn't a slow clean, it's a missing checkout, and averaging it in is
// exactly the "misleading average" the metric must not produce.
const MAX_PLAUSIBLE_CLEANING_MS = 6 * 3600 * 1000;

// Backs the Dashboard's "Housekeeping Operations" section (spec sections
// 13/14) — one aggregation route rather than four separate ones, since
// every figure here is cheap (small counts/averages over already-indexed
// columns) and the Dashboard already fans reads out across prismaPool for
// exactly this reason (see src/lib/prisma.ts's pool comment).
export async function GET() {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;

  const unitFilter = dashboardUnitWhere(user);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [liveStates, openShifts, todaysLogs, credentials, todaysShifts, monthlyLogs, monthlyCredentials, monthlyCheckouts] = await Promise.all([
    prismaPool[0].housekeepingUnitState.findMany({
      where: { status: "cleaning", ...unitFilter },
      select: { unitId: true, byName: true, startedAt: true, unit: { select: { shortName: true } } },
    }),
    prismaPool[1].shift.findMany({
      where: { clockOut: null, employee: { role: "HOUSEKEEPING" } },
      select: { employee: { select: { name: true } }, clockIn: true },
    }),
    prismaPool[2].cleaningLog.findMany({
      where: { startedAt: { gte: todayStart }, ...unitFilter },
      select: { startedAt: true, endedAt: true, booking: { select: { checkOutDate: true, date: true, checkOutTime: true } } },
    }),
    prismaPool[3].accessCredential.findMany({
      where: { type: "HOUSEKEEPING", ...unitFilter },
      select: { status: true, validUntil: true },
    }),
    prismaPool[4].shift.findMany({
      where: { clockIn: { gte: todayStart }, employee: { role: "HOUSEKEEPING" } },
      select: { clockOut: true, logoutReason: true },
    }),
    // Monthly Performance (spec section 16) — same shape of query as
    // todaysLogs above, just widened to the calendar month.
    prismaPool[5].cleaningLog.findMany({
      where: { startedAt: { gte: monthStart }, ...unitFilter },
      select: { startedAt: true, endedAt: true, booking: { select: { checkOutDate: true, date: true, checkOutTime: true } } },
    }),
    prismaPool[6].accessCredential.findMany({
      where: { type: "HOUSEKEEPING", createdAt: { gte: monthStart }, ...unitFilter },
      select: { status: true },
    }),
    // "Assigned jobs" — every checkout this month for a unit in scope, the
    // natural denominator for a cleaning success rate (there's no separate
    // cleaning-assignment record in this app; a checkout IS the assignment).
    prismaPool[7].booking.count({
      where: { checkOutDate: { gte: monthStart }, cancelledAt: null, ...unitFilter },
    }),
  ]);

  const workingNames = new Set(liveStates.map((s) => s.byName).filter(Boolean));
  const waiting = openShifts.filter((s) => !workingNames.has(s.employee?.name ?? ""));

  const completedToday = todaysLogs.filter((l) => l.endedAt);
  // Only valid completed sessions within a plausible real-world duration —
  // never an unstarted job, a missing endedAt, or a stale-started outlier
  // (see MAX_PLAUSIBLE_CLEANING_MS above). completedToday itself (the
  // "Completed Today" count) still counts every real completion regardless
  // of how long it took; only the duration figures below exclude outliers.
  const durations = completedToday
    .map((l) => (l.endedAt!.getTime() - l.startedAt.getTime()) / 60000)
    .filter((m) => m * 60000 <= MAX_PLAUSIBLE_CLEANING_MS);
  const avgMinutes = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const fastestMinutes = durations.length ? Math.round(Math.min(...durations)) : null;
  const longestMinutes = durations.length ? Math.round(Math.max(...durations)) : null;
  const overdueCount = liveStates.filter((s) => s.startedAt && now.getTime() - s.startedAt.getTime() > 2 * 3600 * 1000).length;

  // Same 10-minute grace/late convention as minutesLate() in
  // src/app/api/housekeeping/unit/[id]/route.ts, duplicated here rather
  // than imported since that one's scoped to a single booking id, not a
  // batch of already-fetched log rows.
  type LogWithBooking = { startedAt: Date; booking: { checkOutDate: Date | null; date: Date; checkOutTime: string | null } | null };
  /** Minutes late (past the 10-min grace), or null if on-time / no booking
   * / an implausible outlier (see MAX_PLAUSIBLE_LATE_MS above). */
  function lateMinutesFor(l: LogWithBooking): number | null {
    if (!l.booking) return null;
    const scheduledDate = l.booking.checkOutDate ?? l.booking.date;
    const [h, m] = (l.booking.checkOutTime ?? "12:00").split(":").map(Number);
    const scheduled = new Date(scheduledDate);
    scheduled.setUTCHours(h, m, 0, 0);
    const delayMs = l.startedAt.getTime() - scheduled.getTime() - 10 * 60 * 1000;
    return delayMs > 0 && delayMs <= MAX_PLAUSIBLE_LATE_MS ? Math.round(delayMs / 60000) : null;
  }

  const lateJobsToday = todaysLogs.filter((l) => lateMinutesFor(l) !== null).length;

  const activeCredentials = credentials.filter((c) => c.status === "ACTIVE");
  const accessSummary = {
    active: activeCredentials.length,
    expiringSoon: activeCredentials.filter((c) => c.validUntil && c.validUntil <= soon).length,
    expired: credentials.filter((c) => c.status === "EXPIRED").length,
    revoked: credentials.filter((c) => c.status === "REVOKED").length,
  };

  // Same real-completed-session-only rule as today's durations above —
  // monthlyLogs.length (completedJobs) still counts every real completion;
  // only the duration figures exclude implausible outliers.
  const monthlyDurations = monthlyLogs
    .filter((l) => l.endedAt)
    .map((l) => (l.endedAt!.getTime() - l.startedAt.getTime()) / 60000)
    .filter((m) => m * 60000 <= MAX_PLAUSIBLE_CLEANING_MS);
  const monthlyDelaysMinutes = monthlyLogs.map(lateMinutesFor).filter((m): m is number => m !== null);
  const monthlyOverdue = monthlyLogs.filter((l) => l.endedAt && l.endedAt.getTime() - l.startedAt.getTime() > 2 * 3600 * 1000).length;

  const monthly = {
    assignedJobs: monthlyCheckouts,
    completedJobs: monthlyLogs.length,
    avgMinutes: monthlyDurations.length ? Math.round(monthlyDurations.reduce((a, b) => a + b, 0) / monthlyDurations.length) : null,
    fastestMinutes: monthlyDurations.length ? Math.round(Math.min(...monthlyDurations)) : null,
    longestMinutes: monthlyDurations.length ? Math.round(Math.max(...monthlyDurations)) : null,
    avgDelayMinutes: monthlyDelaysMinutes.length ? Math.round(monthlyDelaysMinutes.reduce((a, b) => a + b, 0) / monthlyDelaysMinutes.length) : null,
    lateStarts: monthlyDelaysMinutes.length,
    overdueCleanings: monthlyOverdue,
    // Renamed from "success rate" — "completion rate" says exactly what it
    // measures (completed ÷ assigned) without implying a pass/fail judgment
    // on the housekeeper.
    completionRatePct: monthlyCheckouts > 0 ? Math.round((monthlyLogs.length / monthlyCheckouts) * 100) : null,
    codesGenerated: monthlyCredentials.length,
    // "Used" = revoked, specifically — a HOUSEKEEPING credential is only
    // ever revoked by releaseHousekeepingCredentialForCleaning at the
    // moment a clean actually finishes (see src/lib/access/service.ts), so
    // REVOKED here means "used for a real clean," not just "no longer
    // active." EXPIRED means the opposite: it timed out unused.
    codesUsed: monthlyCredentials.filter((c) => c.status === "REVOKED").length,
    codesExpired: monthlyCredentials.filter((c) => c.status === "EXPIRED").length,
    codesRevoked: monthlyCredentials.filter((c) => c.status === "REVOKED").length,
  };

  const attendance = {
    loggedIn: todaysShifts.filter((s) => !s.clockOut).length,
    working: liveStates.length,
    loggedOut: todaysShifts.filter((s) => s.clockOut && s.logoutReason !== "Scheduled Logout").length,
    autoLoggedOut: todaysShifts.filter((s) => s.logoutReason === "Scheduled Logout").length,
  };

  return NextResponse.json({
    live: {
      cleaning: liveStates.map((s) => ({ unitName: s.unit.shortName, employeeName: s.byName, startedAt: s.startedAt })),
      waiting: waiting.map((s) => ({ employeeName: s.employee?.name ?? "—" })),
    },
    performance: { avgMinutes, fastestMinutes, longestMinutes, lateJobsToday, overdueCount, jobsToday: todaysLogs.length, completedToday: completedToday.length },
    access: accessSummary,
    attendance,
    monthly,
  });
}
