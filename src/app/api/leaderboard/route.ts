import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isBookingCompleted, syncBookerBonusAwards } from "@/lib/gamification";

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Admin/Co-owner get the full ranked list. Any other payroll-role employee
// gets only their own rank + stats — another booker's numbers are never
// sent to them, enforced here server-side (not just hidden in the UI).
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  await syncBookerBonusAwards();

  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const thisMonthIso = dayOf(new Date()).slice(0, 7);

  const bookers = await prisma.employee.findMany({ where: { role: "BOOKER", active: true }, select: { id: true, name: true, userId: true } });
  const bookings = await prisma.booking.findMany({
    where: { bookerId: { in: bookers.map((b) => b.id) } },
    select: { bookerId: true, date: true, checkOutDate: true },
  });
  const bonusAwards = await prisma.bookerBonusAward.findMany({ where: { employeeId: { in: bookers.map((b) => b.id) } } });

  const now = new Date();
  const ranked = bookers
    .map((b) => {
      const completedThisMonth = bookings.filter(
        (bk) => bk.bookerId === b.id && bk.date.toISOString().slice(0, 7) === thisMonthIso && isBookingCompleted(bk, now)
      ).length;
      const commissionThisMonth = completedThisMonth * settings.bookerCommission;
      const bonusThisMonth = bonusAwards
        .filter((a) => a.employeeId === b.id && a.month.toISOString().slice(0, 7) === thisMonthIso)
        .reduce((s, a) => s + a.amount, 0);
      return { employeeId: b.id, name: b.name, completedThisMonth, commissionThisMonth, bonusThisMonth };
    })
    .sort((a, b) => b.completedThisMonth - a.completedThisMonth);

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
