import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isBookingCompleted, syncEliteBookerAwards } from "@/lib/gamification";

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Same ranked list for every viewer this month — only the final admin-vs-own
// slice below differs per viewer, and that's cheap in-memory work done
// outside the cache. Nothing here touches a Date after computing `ranked`
// (every field is already a string/number), so caching this directly is
// safe with no serialization surprises. 45s matches the Dashboard's cache.
const getRankedLeaderboard = unstable_cache(
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
  ["leaderboard-ranked"],
  { revalidate: 45 }
);

// Admin/Co-owner get the full ranked list. Any other payroll-role employee
// gets only their own rank + stats — another booker's numbers are never
// sent to them, enforced here server-side (not just hidden in the UI).
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  // Award-slot writes must never be skipped by the cache above — always run
  // live so a newly-crossed tier is persisted the moment it happens.
  await syncEliteBookerAwards();

  const ranked = await getRankedLeaderboard();

  const isAdminViewer = user.role === "OWNER_ADMIN" || user.role === "CO_OWNER";
  if (isAdminViewer) {
    return NextResponse.json({ scope: "all", leaderboard: ranked });
  }

  const own = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  const ownIndex = own ? ranked.findIndex((r) => r.employeeId === own.id) : -1;
  if (ownIndex === -1) {
    return NextResponse.json({ scope: "own", rank: null, total: ranked.length, own: null });
  }
  return NextResponse.json({ scope: "own", rank: ownIndex + 1, total: ranked.length, own: ranked[ownIndex] });
}
