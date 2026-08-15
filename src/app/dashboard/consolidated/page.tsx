import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma, prismaPool } from "@/lib/prisma";
import { manilaMonthStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { getCachedBookingSettings } from "@/lib/bookingEngine/settingsCache";
import { getDashboardData } from "@/lib/dashboardData";
import { DashboardView } from "@/components/dashboard/DashboardView";

/**
 * "All Staycations" — a real cross-property view for an Owner/Admin or
 * Co-owner granted access to more than one staycation (see OwnerAccess /
 * StaycationSwitcher.tsx), scoped to whichever properties *they* are
 * authorized for, never every owner on the platform (that stays
 * /platform's separate, explicitly-gated domain — see requirePlatformAdmin's
 * own doc comment in ownerScope.ts).
 *
 * Deliberately reuses getDashboardData (the exact per-property Dashboard's
 * own cached query) once per authorized owner and concatenates the raw
 * result arrays, then feeds that combined set through the unmodified
 * DashboardView — the same component every single-property Dashboard
 * already uses. This is not a shortcut: it's the mathematically correct
 * way to combine more than one property's numbers. DashboardView computes
 * occupancy/ADR/RevPAR/net-profit from real booking/unit *counts*, not
 * from pre-computed percentages — summing raw rows first and computing
 * once produces a real combined figure; averaging two properties' already-
 * computed percentages would not (a 100%-occupied 1-unit property and a
 * 0%-occupied 4-unit property is a real 20% combined occupancy, not the
 * 50% a naive average of the two percentages would show).
 */
export default async function ConsolidatedDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Same page-level roles the per-property Dashboard itself requires
  // (ROUTE_ROLES["/dashboard"] in middleware.ts) — a role that can't see
  // one property's Dashboard has no business seeing several blended
  // together either.
  if (user.role !== "OWNER_ADMIN" && user.role !== "CO_OWNER") redirect("/dashboard");

  const grants = await prisma.ownerAccess.findMany({
    where: { userId: user.id, role: { in: ["OWNER_ADMIN", "CO_OWNER"] }, owner: { status: "ACTIVE" } },
    select: { ownerId: true, role: true, owner: { select: { id: true, businessName: true, logoUrl: true } } },
  });
  // Nothing to consolidate for someone authorized at just the one property
  // — send them to the real Dashboard rather than a blended view of one.
  if (grants.length < 2) redirect("/dashboard");

  const monthStart = manilaMonthStart(new Date());
  await Promise.all(grants.map((g) => ensureRecurringBillsForMonth(monthStart, g.ownerId).catch(() => {})));

  const perOwnerData = await Promise.all(
    grants.map((g) => getDashboardData(g.role, [], g.ownerId).catch(() => null))
  );

  const ARRAY_KEYS = [
    "units", "bookingsWeek", "bookingsMonth", "employees", "bills", "hkStates", "earningsBookings",
    "weeklyExpenses", "attentionFindings", "stocks", "salaryHistory", "expenseRequestsMonth", "cleaningLogsRecent",
    "calendarBlocksOccupancy", "reserveAccessCodes", "bookingsPrevMonth", "billsRecent", "expenseRequestsRecent",
  ] as const;
  const merged: Record<string, any[]> = Object.fromEntries(ARRAY_KEYS.map((k) => [k, []]));
  for (const data of perOwnerData) {
    if (!data) continue;
    for (const key of ARRAY_KEYS) merged[key].push(...(data as any)[key]);
  }
  // Window boundaries are identical across every owner's fetch (same
  // "now", computed inside the same cached function) — any one of them is
  // the real combined range, not an approximation.
  const ranges = perOwnerData.find((d) => d) as any;

  // Settings-derived display thresholds (revenue target/battery colors)
  // are genuinely per-owner and don't have a single correct "combined"
  // value — this uses whichever authorized owner's Settings the caller's
  // own account is rooted at (falling back to the first grant) as a
  // reasonable default, same spirit as picking one business's branding
  // for a multi-tenant surface elsewhere in this app.
  const settingsOwnerId = grants.find((g) => g.ownerId === user.ownerId)?.ownerId ?? grants[0].ownerId;
  const bookingSettings = await getCachedBookingSettings(settingsOwnerId).catch(() => ({ batteryLowThresholdPct: 30, batteryCriticalThresholdPct: 20, monthlyRevenueTargetPerUnit: 50000 }));

  const [dismissedAttentionKeys, airbnbHistoricalMonthly, pendingGuestRequests] = await Promise.all([
    prismaPool[0].dismissedAttentionItem.findMany({ select: { key: true } }).then((rows) => rows.map((r) => r.key)).catch(() => [] as string[]),
    prismaPool[1].airbnbEarningsMonth
      .findMany({ where: { unitId: null, month: { gte: new Date("2025-02-01"), lte: new Date("2026-03-01") } }, select: { month: true, totalCentavos: true } })
      .then((rows) => Object.fromEntries(rows.map((r) => [`${r.month.getUTCFullYear()}-${String(r.month.getUTCMonth() + 1).padStart(2, "0")}`, r.totalCentavos / 100])))
      .catch(() => ({}) as Record<string, number>),
    prismaPool[2].guestRequest
      .findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, type: true, message: true, priority: true, photoUrl: true, createdAt: true, unit: { select: { shortName: true } }, guest: { select: { name: true, email: true } } },
      })
      .catch(() => [] as any[]),
  ]);

  return (
    <div>
      <div className="mx-auto max-w-[1240px] px-4 pt-5 sm:px-6">
        <div className="card mb-2 flex flex-wrap items-center justify-between gap-3 border-[color:var(--skin-primary,#6c5ce7)]/30 bg-[color:var(--skin-primary,#6c5ce7)]/5 px-4 py-3">
          <div className="flex items-center gap-2 text-[13.5px] font-bold">
            <span aria-hidden="true">🏨</span>
            All Staycations — combined view of {grants.length} properties
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[var(--gray)]">
            {grants.map((g) => (
              <span key={g.ownerId} className="rounded-full border border-[var(--line-2)] bg-[var(--card)] px-2.5 py-1">{g.owner.businessName}</span>
            ))}
            <Link href="/dashboard" className="ml-1 font-bold text-[color:var(--skin-primary,#6c5ce7)] hover:underline">View one property →</Link>
          </div>
        </div>
      </div>
      <DashboardView
        role={user.role}
        units={JSON.parse(JSON.stringify(merged.units))}
        bookingsWeek={JSON.parse(JSON.stringify(merged.bookingsWeek))}
        bookingsMonth={JSON.parse(JSON.stringify(merged.bookingsMonth))}
        employees={JSON.parse(JSON.stringify(merged.employees))}
        bills={JSON.parse(JSON.stringify(merged.bills))}
        hkStates={JSON.parse(JSON.stringify(merged.hkStates))}
        earningsBookings={JSON.parse(JSON.stringify(merged.earningsBookings))}
        weeklyExpenses={JSON.parse(JSON.stringify(merged.weeklyExpenses))}
        attentionFindings={JSON.parse(JSON.stringify(merged.attentionFindings))}
        stocks={JSON.parse(JSON.stringify(merged.stocks))}
        salaryHistory={JSON.parse(JSON.stringify(merged.salaryHistory))}
        expenseRequestsMonth={JSON.parse(JSON.stringify(merged.expenseRequestsMonth))}
        cleaningLogsRecent={JSON.parse(JSON.stringify(merged.cleaningLogsRecent))}
        calendarBlocksOccupancy={JSON.parse(JSON.stringify(merged.calendarBlocksOccupancy))}
        reserveAccessCodes={JSON.parse(JSON.stringify(merged.reserveAccessCodes))}
        ttlockStatus={null}
        bookingsPrevMonth={JSON.parse(JSON.stringify(merged.bookingsPrevMonth))}
        billsRecent={JSON.parse(JSON.stringify(merged.billsRecent))}
        expenseRequestsRecent={JSON.parse(JSON.stringify(merged.expenseRequestsRecent))}
        monthlyRevenueTargetPerUnit={bookingSettings.monthlyRevenueTargetPerUnit}
        batteryLowThresholdPct={bookingSettings.batteryLowThresholdPct}
        batteryCriticalThresholdPct={bookingSettings.batteryCriticalThresholdPct}
        pendingGuestRequests={JSON.parse(JSON.stringify(pendingGuestRequests))}
        weekRangeStart={new Date(ranges.weekRangeStart).toISOString()}
        weekRangeEnd={new Date(ranges.weekRangeEnd).toISOString()}
        monthRangeStart={new Date(ranges.monthRangeStart).toISOString()}
        monthRangeEnd={new Date(ranges.monthRangeEnd).toISOString()}
        dismissedAttentionKeys={dismissedAttentionKeys}
        airbnbHistoricalMonthly={airbnbHistoricalMonthly}
      />
    </div>
  );
}
