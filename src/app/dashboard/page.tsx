import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { effectivePageAccess } from "@/lib/pageAccess";
import { prismaPool } from "@/lib/prisma";
import { manilaMonthStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { getCachedBookingSettings } from "@/lib/bookingEngine/settingsCache";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getDashboardData } from "@/lib/dashboardData";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!effectivePageAccess(user.role, user.additionalPageAccess, user.ownerEnabledModules).includes("/dashboard")) redirect("/");
  const monthStart = manilaMonthStart(new Date());
  // Every active recurring-expense template must have this month's Bill
  // before we read any bills below — this is what makes "auto-generate next
  // month's expense" actually happen: the moment anyone loads a page in a
  // new month, that month's bills materialize. Runs uncached, every request
  // — it's a cheap idempotent write, and the dashboard-data cache above must
  // never be the thing standing between a new month and its bills existing.
  await ensureRecurringBillsForMonth(monthStart, user.ownerId).catch(() => {});

  // Battery-tier thresholds for the Battery Health widget/badges/attention
  // items below — 60s-cached (getCachedBookingSettings), same window every
  // other Settings-driven read in the app already uses. Falls back to the
  // schema defaults (matching the demo-fixture path below) rather than
  // throwing, so a DB hiccup here can't take down the whole dashboard.
  const bookingSettings = await getCachedBookingSettings(user.ownerId!).catch(() => ({ batteryLowThresholdPct: 30, batteryCriticalThresholdPct: 20, monthlyRevenueTargetPerUnit: 50000 }));

  // Uncached, every request — a dismissal should disappear from "Needs your
  // attention" immediately, not wait out the dashboard-data cache's 45s
  // window. Cheap: a handful of rows at most. These three reads are fully
  // independent of each other, so they're fanned out via Promise.all across
  // separate pool clients instead of three sequential round trips — the
  // libSQL adapter serializes queries on a single client behind a mutex, so
  // running these one after another (or Promise.all-ing them on the same
  // shared `prisma` client) got no real concurrency (see src/lib/prisma.ts).
  const [dismissedAttentionKeys, airbnbHistoricalMonthly, pendingGuestRequests] = await Promise.all([
    prismaPool[0].dismissedAttentionItem
      .findMany({ select: { key: true } })
      .then((rows) => rows.map((r) => r.key))
      .catch(() => [] as string[]),

    // Airbnb's own officially-reported monthly totals (Feb 2025 - Mar 2026,
    // mostly pre-dating this app) — a record-keeping fallback for the
    // Earnings card's Monthly view, folded in there instead of showing as a
    // separate card (see DashboardView's airbnbHistoricalMonthly prop).
    // Cheap, rarely-changing dataset — an uncached direct read is simplest.
    prismaPool[1].airbnbEarningsMonth
      .findMany({
        where: { unitId: null, month: { gte: new Date("2025-02-01"), lte: new Date("2026-03-01") } },
        select: { month: true, totalCentavos: true },
      })
      .then((rows) =>
        Object.fromEntries(
          rows.map((r) => [`${r.month.getUTCFullYear()}-${String(r.month.getUTCMonth() + 1).padStart(2, "0")}`, r.totalCentavos / 100])
        )
      )
      .catch(() => ({}) as Record<string, number>),

    // Same reasoning as dismissedAttentionKeys above — a guest request from
    // the Digital Guidebook should show up on the next load, not wait out
    // the 45s dashboard-data cache. Feeds "Needs your attention".
    prismaPool[2].guestRequest
      .findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, type: true, message: true, priority: true, photoUrl: true, createdAt: true, unit: { select: { shortName: true } }, guest: { select: { name: true, email: true } } },
      })
      .catch(() => [] as any[]),
  ]);

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
  let reserveAccessCodes: any[] = [];
  let ttlockStatus: any = null;
  let bookingsPrevMonth: any[] = [];
  let billsRecent: any[] = [];
  let expenseRequestsRecent: any[] = [];
  let weekRangeStart = new Date(Date.now() - 7 * 86400000);
  let weekRangeEnd = new Date();
  let monthRangeStart = monthStart;
  let monthRangeEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  try {
    const data = await getDashboardData(user.role, user.ownedUnitIds, user.ownerId);
    ({ units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings, weeklyExpenses, attentionFindings, stocks, salaryHistory, expenseRequestsMonth, cleaningLogsRecent, calendarBlocksOccupancy, reserveAccessCodes, ttlockStatus, bookingsPrevMonth, billsRecent, expenseRequestsRecent, weekRangeStart, weekRangeEnd, monthRangeStart, monthRangeEnd } = data);
  } catch (e) {
    // If Prisma/DB is not available (demo), provide lightweight demo fixtures so the dashboard can render.
    units = [
      { id: "demo-u-1", name: "Evangelina’s Comfort Stay", shortName: "Comfort Stay", unitNumber: "1118", nightlyRate: 1799, rating: 4.9, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-2", name: "Evangelina’s Cozy City Stay", shortName: "Cozy City Stay", unitNumber: "1558", nightlyRate: 1799, rating: 4.8, location: "Cubao, Araneta City", owners: [] },
      { id: "demo-u-3", name: "Relax at Evangelina’s Stay", shortName: "Relax Stay", unitNumber: "1116", nightlyRate: 1799, rating: 4.85, location: "Cubao, Araneta City", owners: [] },
    ];
    bookingsWeek = units.map((u, i) => ({ id: `demo-book-${i}`, unitId: u.id, unit: u, date: new Date(Date.now() - i * 86400000).toISOString(), stayType: "Full", guests: ["Demo Guest"], pax: 2, amount: 1799, paid: true, dpAmount: 500, receivedById: null, dpReceivedById: null, cancelledAt: null, refundedAt: null }));
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
      reserveAccessCodes={JSON.parse(JSON.stringify(reserveAccessCodes))}
      ttlockStatus={JSON.parse(JSON.stringify(ttlockStatus))}
      bookingsPrevMonth={JSON.parse(JSON.stringify(bookingsPrevMonth))}
      billsRecent={JSON.parse(JSON.stringify(billsRecent))}
      expenseRequestsRecent={JSON.parse(JSON.stringify(expenseRequestsRecent))}
      monthlyRevenueTargetPerUnit={bookingSettings.monthlyRevenueTargetPerUnit}
      batteryLowThresholdPct={bookingSettings.batteryLowThresholdPct}
      batteryCriticalThresholdPct={bookingSettings.batteryCriticalThresholdPct}
      pendingGuestRequests={JSON.parse(JSON.stringify(pendingGuestRequests))}
      weekRangeStart={new Date(weekRangeStart).toISOString()}
      weekRangeEnd={new Date(weekRangeEnd).toISOString()}
      monthRangeStart={new Date(monthRangeStart).toISOString()}
      monthRangeEnd={new Date(monthRangeEnd).toISOString()}
      dismissedAttentionKeys={dismissedAttentionKeys}
      airbnbHistoricalMonthly={airbnbHistoricalMonthly}
    />
  );
}
