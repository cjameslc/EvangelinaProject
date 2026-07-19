import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { dashboardUnitWhere, dashboardUnitIdWhere } from "@/lib/session";
import { manilaMonthStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeDashboard(user.role)) redirect("/");
  const where = dashboardUnitWhere(user);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = manilaMonthStart(now);
  const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  // Every active recurring-expense template must have this month's Bill
  // before we read any bills below — this is what makes "auto-generate next
  // month's expense" actually happen: the moment anyone loads a page in a
  // new month, that month's bills materialize.
  await ensureRecurringBillsForMonth(monthStart).catch(() => {});

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
  let cleaningLogs: any[] = [];
  let salaryHistory: any[] = [];
  let payrollRates = { housekeepingDayRate: 700, housekeepingNightBonus: 300, bookerCommission: 100, auditorWeeklyRate: 0 };

  try {
    // Findings scoped to this user's units, plus any general (no-unit) ones.
    const unitFilter = (where as any).unitId;
    const findingsWhere = unitFilter ? { OR: [{ unitId: unitFilter }, { unitId: null }] } : {};

    const res = await Promise.all([
      prisma.unit.findMany({ where: dashboardUnitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
      prisma.booking.findMany({ where: { ...where, date: { gte: weekAgo } }, include: { unit: true } }),
      prisma.booking.findMany({ where: { ...where, date: { gte: monthStart, lt: nextMonthStart } } }),
      prisma.employee.findMany({ where: { active: true } }),
      prisma.bill.findMany({ where: { ...where, month: monthStart }, include: { unit: true } }),
      prisma.housekeepingUnitState.findMany({ where, include: { unit: true } }),
      // A broad, unwindowed set so the Earnings card can filter by an
      // arbitrary Weekly/Monthly/Yearly period client-side instead of only
      // the fixed last-7-days/month-to-date slices above.
      prisma.booking.findMany({ where, orderBy: { date: "desc" }, take: 500 }),
      // Weekly expenses aren't tied to a unit (salaries, ad spend, etc.) — used
      // for the Earnings "Salary" line. The full manual-entry editor now
      // lives on the Admin page's Weekly report tab.
      prisma.weeklyExpense.findMany({ orderBy: { date: "desc" }, take: 300, include: { targetEmployee: { select: { id: true, name: true, role: true } }, addedBy: { select: { id: true, name: true } } } }),
      // Feeds the "Needs your attention" card — open Critical/Warning findings only.
      prisma.auditFinding.findMany({
        where: { ...findingsWhere, resolved: false, severity: { in: ["Critical", "Warning"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          unit: { select: { shortName: true } },
          employee: { select: { name: true } },
        },
      }),
      prisma.stock.findMany({ where }),
      // Feeds the "Your team" salary summary — days worked by housekeeping.
      // Unwindowed (like earningsBookings/weeklyExpenses below) so "Your
      // team" can be recomputed for whatever period the Earnings card's
      // filter selects (This week/This month/This year/Custom), not just
      // the last 7 days.
      prisma.cleaningLog.findMany({ where, orderBy: { startedAt: "desc" }, take: 2000, select: { id: true, employeeId: true, unitId: true, startedAt: true } }),
      prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
      // Point-in-time salary rates — lets the Earnings card look up whatever
      // rate was effective at the start of any past period, not just the
      // employee's current one, so a later raise/cut never rewrites history.
      prisma.salaryHistory.findMany({ select: { employeeId: true, monthlySalary: true, effectiveDate: true } }),
    ]);
    [units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings, weeklyExpenses, attentionFindings, stocks, cleaningLogs] = res as any;
    const settings = res[11] as any;
    salaryHistory = res[12] as any;
    payrollRates = {
      housekeepingDayRate: settings.housekeepingDayRate,
      housekeepingNightBonus: settings.housekeepingNightBonus,
      bookerCommission: settings.bookerCommission,
      auditorWeeklyRate: settings.auditorWeeklyRate,
    };
  } catch (e) {
    // If Prisma/DB is not available (demo), provide lightweight demo fixtures so the dashboard can render.
    units = [
      { id: "demo-u-1", name: "Evangelina’s Comfort Stay", shortName: "Comfort Stay", unitNumber: "1118", nightlyRate: 1799, rating: 4.9, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-2", name: "Evangelina’s Cozy City Stay", shortName: "Cozy City Stay", unitNumber: "1558", nightlyRate: 1799, rating: 4.8, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-3", name: "Relax at Evangelina’s Stay", shortName: "Relax Stay", unitNumber: "1116", nightlyRate: 1799, rating: 4.85, location: "Cubao, Araneta City", owners: [] },
    ];
    bookingsWeek = units.map((u, i) => ({ id: `demo-book-${i}`, unitId: u.id, unit: u, date: new Date(Date.now() - i * 86400000).toISOString(), stayType: "Full", guests: ["Demo Guest"], pax: 2, amount: 1799, paid: true, dpAmount: 500, receivedById: null, dpReceivedById: null }));
    bookingsMonth = bookingsWeek;
    employees = [{ id: "demo-e-1", name: "Demo Booker", role: "BOOKER", monthlySalary: 15000, active: true }];
    bills = units.map((u, i) => ({ id: `b-${i}`, unitId: u.id, key: "assoc", month: monthStart.toISOString(), amountDue: 3500, paid: false, unit: u }));
    hkStates = units.map((u) => ({ unitId: u.id, status: "clean", unit: u }));
    earningsBookings = bookingsWeek;
    weeklyExpenses = [];
    attentionFindings = [];
    stocks = [];
    cleaningLogs = [];
    salaryHistory = [];
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
      cleaningLogs={JSON.parse(JSON.stringify(cleaningLogs))}
      payrollRates={payrollRates}
      salaryHistory={JSON.parse(JSON.stringify(salaryHistory))}
    />
  );
}
