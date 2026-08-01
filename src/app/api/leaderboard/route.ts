import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma, prismaPool } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isBookingCompleted, syncEliteBookerAwards, ELITE_CHALLENGE_ROLES } from "@/lib/gamification";
import { isCommissionEligible } from "@/lib/bookingStatus";

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Same ranked list for every viewer this month — only the final admin-vs-own
// slice below differs per viewer, and that's cheap in-memory work done
// outside the cache. Nothing here touches a Date after computing `ranked`
// (every field is already a string/number), so caching this directly is
// safe with no serialization surprises. 45s matches the Dashboard's cache.
// Eligible employees are Bookers plus Housekeeping staff (several people do
// both jobs at this business, so their booking activity is real booker
// activity and belongs in the same ranked pool, not a separate board).
//
// Deliberately does NOT select avatarUrl here — that's a base64-encoded
// photo per employee, and with several real staff photos the combined
// cached payload blew past Next's 2MB per-entry data-cache limit. The
// write then silently failed every single time (logged as an
// unhandledRejection), so this "cached" query was actually recomputing
// from scratch on every request — 20+ second responses, and the /earnings
// page timing out for a Booker. avatarUrl is fetched fresh, uncached,
// outside this function instead (see GET below) — same "always fetched
// fresh from the DB wherever it's shown" pattern already used for
// avatarUrl everywhere else in the app, so nothing actually goes stale.
const getRankedLeaderboard = unstable_cache(
  async () => {
    const now = new Date();
    const [y, m] = dayOf(now).split("-").map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const nextMonthStart = new Date(Date.UTC(y, m, 1));

    // The upsert (a write) stays on `prisma`; the read alongside it moves
    // to the pool — libSQL serializes queries on a single client behind a
    // mutex, so Promise.all-ing reads on `prisma` alone gets no real
    // concurrency (see src/lib/prisma.ts).
    const [settings, bookers] = await Promise.all([
      prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
      prismaPool[0].employee.findMany({
        where: { role: { in: [...ELITE_CHALLENGE_ROLES] }, active: true },
        select: { id: true, name: true, userId: true, user: { select: { avatarColor: true } } },
      }),
    ]);
    const bookerIds = bookers.map((b) => b.id);
    const [bookings, bonusAwards] = await Promise.all([
      // Only this month's bookings are needed for the ranking below — the
      // previous version pulled every booking ever made and filtered in JS.
      // No cancelledAt filter — a cancelled booking can still be
      // commission-eligible (see isCommissionEligible), so it has to stay in
      // this set; completedThisMonth below explicitly excludes it instead,
      // to keep Elite Challenge ranking exactly as before.
      prismaPool[1].booking.findMany({
        where: { bookerId: { in: bookerIds }, date: { gte: monthStart, lt: nextMonthStart } },
        select: { bookerId: true, date: true, checkOutDate: true, cancelledAt: true, cancellationCategory: true, paid: true, dpAmount: true, refundedAt: true },
      }),
      prismaPool[2].eliteBookerAward.findMany({ where: { employeeId: { in: bookerIds }, month: monthStart } }),
    ]);

    return bookers
      .map((b) => {
        const completedThisMonth = bookings.filter((bk) => bk.bookerId === b.id && !bk.cancelledAt && isBookingCompleted(bk, now)).length;
        // Real commission — independent of the ranking above (see
        // isCommissionEligible: paid, or a cancelled booking whose deposit
        // wasn't refunded).
        const commissionEligibleThisMonth = bookings.filter((bk) => bk.bookerId === b.id && isCommissionEligible(bk)).length;
        const commissionThisMonth = commissionEligibleThisMonth * settings.bookerCommission;
        const bonusThisMonth = bonusAwards
          .filter((a) => a.employeeId === b.id)
          .reduce((s, a) => s + a.amount, 0);
        return {
          employeeId: b.id,
          name: b.name,
          avatarUrl: null as string | null, // filled in after the cache, see GET below
          avatarColor: b.user?.avatarColor ?? "#FF385C",
          completedThisMonth,
          commissionThisMonth,
          bonusThisMonth,
        };
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

  const cached = await getRankedLeaderboard();

  // Fresh, uncached, and cheap (just one TEXT column per employee) — kept
  // out of the cached ranking above specifically so a real photo never
  // blows past the data cache's per-entry size limit (see comment above
  // getRankedLeaderboard).
  const photoRows = await prisma.employee.findMany({
    where: { id: { in: cached.map((r) => r.employeeId) } },
    select: { id: true, user: { select: { avatarUrl: true } } },
  });
  const photoById = new Map(photoRows.map((r) => [r.id, r.user?.avatarUrl ?? null]));
  const ranked = cached.map((r) => ({ ...r, avatarUrl: photoById.get(r.employeeId) ?? null }));

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
