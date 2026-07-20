import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isBookingCompleted, syncEliteBookerAwards, syncEliteCleanerAwards } from "@/lib/gamification";

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Same ranked list for every viewer this month — only the final admin-vs-own
// slice below differs per viewer, and that's cheap in-memory work done
// outside the cache. Nothing here touches a Date after computing `ranked`
// (every field is already a string/number), so caching this directly is
// safe with no serialization surprises. 45s matches the Dashboard's cache.
const getRankedBookers = unstable_cache(
  async () => {
    const now = new Date();
    const [y, m] = dayOf(now).split("-").map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const nextMonthStart = new Date(Date.UTC(y, m, 1));

    const [settings, bookers] = await Promise.all([
      prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
      prisma.employee.findMany({ where: { role: "BOOKER", active: true }, select: { id: true, name: true, userId: true } }),
    ]);
    const bookerIds = bookers.map((b) => b.id);
    const [bookings, bonusAwards] = await Promise.all([
      // Only this month's bookings are needed for the ranking below — the
      // previous version pulled every booking ever made and filtered in JS.
      prisma.booking.findMany({
        where: { bookerId: { in: bookerIds }, date: { gte: monthStart, lt: nextMonthStart } },
        select: { bookerId: true, date: true, checkOutDate: true },
      }),
      prisma.eliteBookerAward.findMany({ where: { employeeId: { in: bookerIds }, month: monthStart } }),
    ]);

    return bookers
      .map((b) => {
        const completedThisMonth = bookings.filter((bk) => bk.bookerId === b.id && isBookingCompleted(bk, now)).length;
        const commissionThisMonth = completedThisMonth * settings.bookerCommission;
        const bonusThisMonth = bonusAwards
          .filter((a) => a.employeeId === b.id)
          .reduce((s, a) => s + a.amount, 0);
        return { employeeId: b.id, name: b.name, completedThisMonth, commissionThisMonth, bonusThisMonth };
      })
      .sort((a, b) => b.completedThisMonth - a.completedThisMonth);
  },
  ["leaderboard-ranked-bookers"],
  { revalidate: 45 }
);

// Same shape/logic as getRankedBookers, but ranked by distinct cleaning
// days this month (the Housekeeping metric) instead of completed bookings.
const getRankedCleaners = unstable_cache(
  async () => {
    const now = new Date();
    const [y, m] = dayOf(now).split("-").map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const nextMonthStart = new Date(Date.UTC(y, m, 1));

    const [settings, cleaners] = await Promise.all([
      prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
      prisma.employee.findMany({ where: { role: "HOUSEKEEPING", active: true }, select: { id: true, name: true, userId: true } }),
    ]);
    const cleanerIds = cleaners.map((c) => c.id);
    const [logs, bonusAwards] = await Promise.all([
      prisma.cleaningLog.findMany({
        where: { employeeId: { in: cleanerIds }, startedAt: { gte: monthStart, lt: nextMonthStart } },
        select: { employeeId: true, startedAt: true },
      }),
      prisma.eliteCleanerAward.findMany({ where: { employeeId: { in: cleanerIds }, month: monthStart } }),
    ]);

    const daysByEmployee = new Map<string, Set<string>>();
    logs.forEach((l) => {
      if (!l.employeeId) return;
      if (!daysByEmployee.has(l.employeeId)) daysByEmployee.set(l.employeeId, new Set());
      daysByEmployee.get(l.employeeId)!.add(dayOf(new Date(l.startedAt)));
    });

    return cleaners
      .map((c) => {
        const completedThisMonth = daysByEmployee.get(c.id)?.size ?? 0;
        const commissionThisMonth = completedThisMonth * settings.housekeepingDayRate;
        const bonusThisMonth = bonusAwards
          .filter((a) => a.employeeId === c.id)
          .reduce((s, a) => s + a.amount, 0);
        return { employeeId: c.id, name: c.name, completedThisMonth, commissionThisMonth, bonusThisMonth };
      })
      .sort((a, b) => b.completedThisMonth - a.completedThisMonth);
  },
  ["leaderboard-ranked-cleaners"],
  { revalidate: 45 }
);

// Admin/Co-owner get the full ranked list for whichever board they ask for
// (?role=HOUSEKEEPING, default BOOKER). Any other payroll-role employee
// gets only their own board — inferred from their own linked Employee
// record, not a query param, so a cleaner can never see the booker board
// (or vice versa) by fiddling the URL — and always gets their OWN rank +
// stats, never another employee's, enforced here server-side.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const isAdminViewer = user.role === "OWNER_ADMIN" || user.role === "CO_OWNER";
  const own = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true, role: true } });

  const requestedRole = req.nextUrl.searchParams.get("role");
  const board: "BOOKER" | "HOUSEKEEPING" =
    (isAdminViewer ? requestedRole : own?.role) === "HOUSEKEEPING" ? "HOUSEKEEPING" : "BOOKER";
  const metric = board === "HOUSEKEEPING" ? "cleaningDays" : "bookings";

  // Award-slot writes must never be skipped by the cache above — always run
  // live so a newly-crossed tier is persisted the moment it happens.
  if (board === "HOUSEKEEPING") await syncEliteCleanerAwards();
  else await syncEliteBookerAwards();

  const ranked = board === "HOUSEKEEPING" ? await getRankedCleaners() : await getRankedBookers();

  if (isAdminViewer) {
    return NextResponse.json({ scope: "all", metric, leaderboard: ranked });
  }

  const ownIndex = own ? ranked.findIndex((r) => r.employeeId === own.id) : -1;
  if (ownIndex === -1) {
    return NextResponse.json({ scope: "own", metric, rank: null, total: ranked.length, own: null });
  }
  return NextResponse.json({ scope: "own", metric, rank: ownIndex + 1, total: ranked.length, own: ranked[ownIndex] });
}
