import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { prisma, prismaPool } from "@/lib/prisma";
import { dashboardUnitWhere, dashboardUnitIdWhere } from "@/lib/session";
import { manilaMonthStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { DashboardView } from "@/components/dashboard/DashboardView";

// Everything the Dashboard reads is scoped only by role+ownedUnitIds (see
// dashboardUnitWhere/dashboardUnitIdWhere), so those two are sufficient as a
// cache key — no need to key on the user's id. Revalidates every 45s: fresh
// enough that a booking/payment made just now shows up within under a
// minute, but it means a page load can be up to ~45s stale, which is an
// explicitly accepted tradeoff for how much DB load this page was causing.
// The returned object is pre-normalized (JSON.parse(JSON.stringify(...)))
// before caching so a cache hit and a cache miss return the exact same
// shape — Next's unstable_cache round-trips cached values through JSON
// itself, which would otherwise silently turn Dates into strings only on a
// hit, not a miss.
const getDashboardData = unstable_cache(
  async (role: string, ownedUnitIds: string[]) => {
    const user = { role, ownedUnitIds };
    const where = dashboardUnitWhere(user);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = manilaMonthStart(now);
    const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    // Findings scoped to this user's units, plus any general (no-unit) ones.
    const unitFilter = (where as any).unitId;
    const findingsWhere = unitFilter ? { OR: [{ unitId: unitFilter }, { unitId: null }] } : {};

    // DashboardView never reads a booking's proofUrl/dpProofUrl (those are
    // base64-encoded receipt images, only shown on Bookings' own edit modal)
    // or its `unit` relation (every place it shows a unit name reads it from
    // the separately-fetched `units`/`bills`/`hkStates` arrays instead) — yet
    // all three booking reads below used to fetch full rows including those
    // images. With real receipts attached this was inflating the page's data
    // to 20MB+ for a business with a literal handful of bookings; this select
    // is the fix.
    const dashboardBookingSelect = {
      id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, stayType: true,
      platform: true, amount: true, paid: true, dpAmount: true, guests: true,
      receivedById: true, dpReceivedById: true, cleanerId: true, bookerId: true, conflict: true, cancelledAt: true,
    };

    const res = await Promise.all([
      prismaPool[0].unit.findMany({ where: dashboardUnitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
      prismaPool[1].booking.findMany({ where: { ...where, date: { gte: weekAgo } }, select: dashboardBookingSelect }),
      prismaPool[2].booking.findMany({ where: { ...where, date: { gte: monthStart, lt: nextMonthStart } }, select: dashboardBookingSelect }),
      prismaPool[3].employee.findMany({ where: { active: true } }),
      prismaPool[4].bill.findMany({ where: { ...where, month: monthStart }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
      prismaPool[5].housekeepingUnitState.findMany({ where }),
      // A broad, unwindowed set so the Earnings card can filter by an
      // arbitrary Weekly/Monthly/Yearly period client-side instead of only
      // the fixed last-7-days/month-to-date slices above.
      prismaPool[6].booking.findMany({ where, orderBy: { date: "desc" }, take: 500, select: dashboardBookingSelect }),
      // Weekly expenses aren't tied to a unit (salaries, ad spend, etc.) — used
      // for the Earnings "Salary" line. The full manual-entry editor now
      // lives on the Admin page's Weekly report tab.
      prismaPool[7].weeklyExpense.findMany({ orderBy: { date: "desc" }, take: 300, include: { targetEmployee: { select: { id: true, name: true, role: true } }, addedBy: { select: { id: true, name: true } } } }),
      // Feeds the "Needs your attention" card — open Critical/Warning findings only.
      prismaPool[8].auditFinding.findMany({
        where: { ...findingsWhere, resolved: false, severity: { in: ["Critical", "Warning"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          unit: { select: { shortName: true } },
          employee: { select: { name: true } },
        },
      }),
      prismaPool[9].stock.findMany({ where }),
      // Point-in-time salary rates — lets accrued/upcoming payroll (Realized
      // vs Forecast profit) look up whatever rate was effective at the start
      // of the month, not just the employee's current one, so a later
      // raise/cut never rewrites history.
      prismaPool[10].salaryHistory.findMany({ select: { employeeId: true, monthlySalary: true, effectiveDate: true } }),
      // Employee-submitted ad-hoc expenses (TikTok ads / unit expenses) —
      // APPROVED ones are already-real money (folded into Realized profit
      // like a paid bill); PENDING ones are a possible future cost (folded
      // into Forecast only). Rejected ones never affect either.
      prismaPool[11].expenseRequest.findMany({
        where: { date: { gte: monthStart, lt: nextMonthStart }, status: { in: ["APPROVED", "PENDING"] } },
        select: { id: true, category: true, amount: true, status: true, date: true, employee: { select: { name: true } } },
      }),
      // Feeds "Needs your attention" — a clean marked done unusually fast
      // after being started is worth a second look (rushed or not actually
      // done), not necessarily proof of anything, so this only flags it,
      // never blocks/auto-rejects. Same 7-day window as bookingsWeek.
      prismaPool[12].cleaningLog.findMany({
        where: { ...where, startedAt: { gte: weekAgo }, endedAt: { not: null } },
        select: { id: true, unitId: true, startedAt: true, endedAt: true, employee: { select: { name: true } } },
      }),
      // Maintenance/Cleaning CalendarBlocks overlapping either window below
      // — feeds the real occupancy/RevPAR/ADR math in
      // src/lib/analytics/occupancy.ts (replacing the old flat
      // units.length×days approximation). Booking-derived occupied nights
      // come from bookingsWeek/bookingsMonth directly (via stayRange.ts),
      // not from their mirrored CalendarBlock rows — no need to double-fetch.
      prismaPool[13 % prismaPool.length].calendarBlock.findMany({
        where: { ...where, type: { in: ["Maintenance", "Cleaning"] }, date: { lt: nextMonthStart }, OR: [{ endDate: null }, { endDate: { gt: weekAgo } }] },
        select: { unitId: true, type: true, date: true, endDate: true },
      }),
    ]);
    const [units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings, weeklyExpenses, attentionFindings, stocks, salaryHistory, expenseRequestsMonth, cleaningLogsRecent, calendarBlocksOccupancy] = res as any[];

    return JSON.parse(JSON.stringify({
      units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings,
      weeklyExpenses, attentionFindings, stocks, salaryHistory, expenseRequestsMonth, cleaningLogsRecent,
      calendarBlocksOccupancy,
      // The exact window boundaries used to fetch bookingsWeek/bookingsMonth/
      // calendarBlocksOccupancy above — the client must reuse these (not
      // recompute its own "now") so occupancy/RevPAR/ADR are always
      // calculated over the identical range the underlying rows were
      // fetched for, unaffected by render-time clock drift or this cache's
      // 45s staleness window.
      weekRangeStart: weekAgo, weekRangeEnd: now,
      monthRangeStart: monthStart, monthRangeEnd: nextMonthStart,
    }));
  },
  ["dashboard-data"],
  { revalidate: 45 }
);

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeDashboard(user.role)) redirect("/");
  const monthStart = manilaMonthStart(new Date());
  // Every active recurring-expense template must have this month's Bill
  // before we read any bills below — this is what makes "auto-generate next
  // month's expense" actually happen: the moment anyone loads a page in a
  // new month, that month's bills materialize. Runs uncached, every request
  // — it's a cheap idempotent write, and the dashboard-data cache above must
  // never be the thing standing between a new month and its bills existing.
  await ensureRecurringBillsForMonth(monthStart).catch(() => {});

  // Uncached, every request — a dismissal should disappear from "Needs your
  // attention" immediately, not wait out the dashboard-data cache's 45s
  // window. Cheap: a handful of rows at most.
  const dismissedAttentionKeys = await prisma.dismissedAttentionItem
    .findMany({ select: { key: true } })
    .then((rows) => rows.map((r) => r.key))
    .catch(() => []);

  let units: any[] = [];
  let bookingsWeek: any[] = [];
  let bookingsMonth: any[] = [];
  let employees: any[] = [];
  let bills: any[] = [];
  let hkStates: any[] = [];
  let earningsBookings: any[] = [];
  let weeklyExpenses: any[] = [];
  let attentionFindings: any[] = [];
  let stocks: any[] = [];
  let salaryHistory: any[] = [];
  let expenseRequestsMonth: any[] = [];
  let cleaningLogsRecent: any[] = [];
  let calendarBlocksOccupancy: any[] = [];
  let weekRangeStart = new Date(Date.now() - 7 * 86400000);
  let weekRangeEnd = new Date();
  let monthRangeStart = monthStart;
  let monthRangeEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  try {
    const data = await getDashboardData(user.role, user.ownedUnitIds);
    ({ units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings, weeklyExpenses, attentionFindings, stocks, salaryHistory, expenseRequestsMonth, cleaningLogsRecent, calendarBlocksOccupancy, weekRangeStart, weekRangeEnd, monthRangeStart, monthRangeEnd } = data);
  } catch (e) {
    // If Prisma/DB is not available (demo), provide lightweight demo fixtures so the dashboard can render.
    units = [
      { id: "demo-u-1", name: "Evangelina’s Comfort Stay", shortName: "Comfort Stay", unitNumber: "1118", nightlyRate: 1799, rating: 4.9, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-2", name: "Evangelina’s Cozy City Stay", shortName: "Cozy City Stay", unitNumber: "1558", nightlyRate: 1799, rating: 4.8, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-3", name: "Relax at Evangelina’s Stay", shortName: "Relax Stay", unitNumber: "1116", nightlyRate: 1799, rating: 4.85, location: "Cubao, Araneta City", owners: [] },
    ];
    bookingsWeek = units.map((u, i) => ({ id: `demo-book-${i}`, unitId: u.id, unit: u, date: new Date(Date.now() - i * 86400000).toISOString(), stayType: "Full", guests: ["Demo Guest"], pax: 2, amount: 1799, paid: true, dpAmount: 500, receivedById: null, dpReceivedById: null, cancelledAt: null }));
    bookingsMonth = bookingsWeek;
    employees = [{ id: "demo-e-1", name: "Demo Booker", role: "BOOKER", monthlySalary: 15000, active: true }];
    bills = units.map((u, i) => ({ id: `b-${i}`, unitId: u.id, key: "assoc", month: monthStart.toISOString(), amountDue: 3500, paid: false, unit: u }));
    hkStates = units.map((u) => ({ unitId: u.id, status: "clean", unit: u }));
    earningsBookings = bookingsWeek;
    weeklyExpenses = [];
    attentionFindings = [];
    stocks = [];
    salaryHistory = [];
    expenseRequestsMonth = [];
    cleaningLogsRecent = [];
    calendarBlocksOccupancy = [];
  }

  return (
    <DashboardView
      role={user.role}
      units={JSON.parse(JSON.stringify(units))}
      bookingsWeek={JSON.parse(JSON.stringify(bookingsWeek))}
      bookingsMonth={JSON.parse(JSON.stringify(bookingsMonth))}
      employees={JSON.parse(JSON.stringify(employees))}
      bills={JSON.parse(JSON.stringify(bills))}
      hkStates={JSON.parse(JSON.stringify(hkStates))}
      earningsBookings={JSON.parse(JSON.stringify(earningsBookings))}
      weeklyExpenses={JSON.parse(JSON.stringify(weeklyExpenses))}
      attentionFindings={JSON.parse(JSON.stringify(attentionFindings))}
      stocks={JSON.parse(JSON.stringify(stocks))}
      salaryHistory={JSON.parse(JSON.stringify(salaryHistory))}
      expenseRequestsMonth={JSON.parse(JSON.stringify(expenseRequestsMonth))}
      cleaningLogsRecent={JSON.parse(JSON.stringify(cleaningLogsRecent))}
      calendarBlocksOccupancy={JSON.parse(JSON.stringify(calendarBlocksOccupancy))}
      weekRangeStart={new Date(weekRangeStart).toISOString()}
      weekRangeEnd={new Date(weekRangeEnd).toISOString()}
      monthRangeStart={new Date(monthRangeStart).toISOString()}
      monthRangeEnd={new Date(monthRangeEnd).toISOString()}
      dismissedAttentionKeys={dismissedAttentionKeys}
    />
  );
}
