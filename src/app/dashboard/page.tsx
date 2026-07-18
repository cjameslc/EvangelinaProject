import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { dashboardUnitWhere, dashboardUnitIdWhere } from "@/lib/session";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeDashboard(user.role)) redirect("/");
  const where = dashboardUnitWhere(user);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let units: any[] = [];
  let bookingsWeek: any[] = [];
  let bookingsMonth: any[] = [];
  let employees: any[] = [];
  let bills: any[] = [];
  let hkStates: any[] = [];
  let earningsBookings: any[] = [];
  let weeklyReportBookings: any[] = [];
  let weeklyExpenses: any[] = [];
  let attentionFindings: any[] = [];
  let stocks: any[] = [];

  try {
    // Findings scoped to this user's units, plus any general (no-unit) ones.
    const unitFilter = (where as any).unitId;
    const findingsWhere = unitFilter ? { OR: [{ unitId: unitFilter }, { unitId: null }] } : {};

    const res = await Promise.all([
      prisma.unit.findMany({ where: dashboardUnitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
      prisma.booking.findMany({ where: { ...where, date: { gte: weekAgo } }, include: { unit: true } }),
      prisma.booking.findMany({ where: { ...where, date: { gte: monthStart } } }),
      prisma.employee.findMany({ where: { active: true } }),
      prisma.bill.findMany({ where: { ...where, month: new Date(now.getFullYear(), now.getMonth(), 1) }, include: { unit: true } }),
      prisma.housekeepingUnitState.findMany({ where, include: { unit: true } }),
      // A broad, unwindowed set so the Earnings card can filter by an
      // arbitrary Weekly/Monthly/Yearly period client-side instead of only
      // the fixed last-7-days/month-to-date slices above.
      prisma.booking.findMany({ where, orderBy: { date: "desc" }, take: 500 }),
      // Feeds the Weekly report card below — scoped to this user's own units
      // the same way the rest of the Dashboard is.
      prisma.booking.findMany({
        where,
        orderBy: { date: "desc" },
        take: 200,
        include: {
          unit: { select: { id: true, name: true, shortName: true, unitNumber: true, owners: { include: { user: { select: { name: true } } } } } },
          booker: { select: { name: true, role: true } },
          receivedBy: { select: { name: true, role: true } },
          dpReceivedBy: { select: { name: true, role: true } },
        },
      }),
      // Weekly expenses aren't tied to a unit (salaries, ad spend, etc.), so
      // every viewer of the Weekly report sees the same company-wide ledger.
      prisma.weeklyExpense.findMany({ orderBy: { date: "desc" }, take: 300, include: { targetEmployee: { select: { id: true, name: true, role: true } } } }),
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
    ]);
    [units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings, weeklyReportBookings, weeklyExpenses, attentionFindings, stocks] = res as any;
  } catch (e) {
    // If Prisma/DB is not available (demo), provide lightweight demo fixtures so the dashboard can render.
    units = [
      { id: "demo-u-1", name: "Evangelina’s Comfort Stay", shortName: "Comfort Stay", unitNumber: "1118", nightlyRate: 1799, rating: 4.9, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-2", name: "Evangelina’s Cozy City Stay", shortName: "Cozy City Stay", unitNumber: "1558", nightlyRate: 1799, rating: 4.8, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-3", name: "Relax at Evangelina’s Stay", shortName: "Relax Stay", unitNumber: "1116", nightlyRate: 1799, rating: 4.85, location: "Cubao, Araneta City", owners: [] },
    ];
    bookingsWeek = units.map((u, i) => ({ id: `demo-book-${i}`, unitId: u.id, unit: u, date: new Date(Date.now() - i * 86400000).toISOString(), stayType: "Full", guests: ["Demo Guest"], pax: 2, amount: 1799, paid: true, dpAmount: 500, receivedById: null, dpReceivedById: null }));
    bookingsMonth = bookingsWeek;
    employees = [{ id: "demo-e-1", name: "Demo Booker", role: "BOOKER" }];
    bills = units.map((u, i) => ({ id: `b-${i}`, unitId: u.id, key: "assoc", month: monthStart.toISOString(), amountDue: 3500, paid: false, unit: u }));
    hkStates = units.map((u) => ({ unitId: u.id, status: "clean", unit: u }));
    earningsBookings = bookingsWeek;
    weeklyReportBookings = [];
    weeklyExpenses = [];
    attentionFindings = [];
    stocks = [];
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
      weeklyReportBookings={JSON.parse(JSON.stringify(weeklyReportBookings))}
      weeklyExpenses={JSON.parse(JSON.stringify(weeklyExpenses))}
      canEditExpenses={user.role === "OWNER_ADMIN"}
      attentionFindings={JSON.parse(JSON.stringify(attentionFindings))}
      stocks={JSON.parse(JSON.stringify(stocks))}
    />
  );
}
