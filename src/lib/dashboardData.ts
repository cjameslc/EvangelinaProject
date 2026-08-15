import { unstable_cache } from "next/cache";
import { prismaPool } from "@/lib/prisma";
import { dashboardUnitWhere, dashboardUnitIdWhere } from "@/lib/session";
import { manilaMonthStart } from "@/lib/format";

// Everything the Dashboard reads is scoped by role+ownedUnitIds+ownerId
// (see dashboardUnitWhere/dashboardUnitIdWhere), so those three are
// sufficient as a cache key — no need to key on the user's id. ownerId is
// load-bearing here, not incidental: without it in the key, a cache hit
// for one owner's admin could serve another owner's cached dashboard data
// (unstable_cache's Next.js-level cache has no idea these two Owner_ADMINs
// are different tenants unless the key says so). Revalidates every 45s:
// fresh enough that a booking/payment made just now shows up within under a
// minute, but it means a page load can be up to ~45s stale, which is an
// explicitly accepted tradeoff for how much DB load this page was causing.
// The returned object is pre-normalized (JSON.parse(JSON.stringify(...)))
// before caching so a cache hit and a cache miss return the exact same
// shape — Next's unstable_cache round-trips cached values through JSON
// itself, which would otherwise silently turn Dates into strings only on a
// hit, not a miss.
//
// Lives in its own module (not inline in dashboard/page.tsx) so
// /dashboard/consolidated can fetch each authorized staycation's raw data
// through this exact same cached function too — Next's page-module type
// checking doesn't allow a page.tsx to export anything beyond its
// recognized special exports (default, metadata, etc.), and see that
// page's own doc comment for why merging the raw arrays this returns,
// rather than re-averaging pre-computed percentages elsewhere, is the
// mathematically correct way to combine more than one property's numbers.
export const getDashboardData = unstable_cache(
  async (role: string, ownedUnitIds: string[], ownerId: string | null) => {
    const user = { role, ownedUnitIds, ownerId };
    const where = dashboardUnitWhere(user);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = manilaMonthStart(now);
    const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    // Previous calendar month — Revenue Goals leaderboard's "fastest
    // growing"/"most improved" highlights compare this month's pace against
    // last month's actual total, so this is fetched alongside bookingsMonth
    // rather than adding a client-side round trip later.
    const prevMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
    // Key Metrics' date-aware comparisons (Dashboard spec: "Aug 1–8 vs Jul
    // 1–8 vs 3-month same-date benchmark of May/Jun/Jul") need real bills/
    // expense-request history for the 3 months before the current one, not
    // just the current month useBillsSummary/useMonthlyProfitSummary
    // already fetch for their own (unchanged) current-month-only figures —
    // billsRecent/expenseRequestsRecent below are additive, separate props
    // for exactly that comparison, never substituted into the existing
    // current-month-only bills/expenseRequestsMonth so nothing already
    // relying on those changes behavior.
    const benchmarkWindowStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 3, 1));
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
      id: true, unitId: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true, stayType: true,
      platform: true, amount: true, paid: true, dpAmount: true, guests: true,
      receivedById: true, dpReceivedById: true, cleanerId: true, bookerId: true, conflict: true, cancelledAt: true, refundedAt: true,
    };

    const res = await Promise.all([
      prismaPool[0].unit.findMany({ where: dashboardUnitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
      prismaPool[1].booking.findMany({ where: { ...where, date: { gte: weekAgo } }, select: dashboardBookingSelect }),
      prismaPool[2].booking.findMany({ where: { ...where, date: { gte: monthStart, lt: nextMonthStart } }, select: dashboardBookingSelect }),
      prismaPool[3].employee.findMany({ where: { active: true, ownerId } }),
      prismaPool[4].bill.findMany({ where: { ...where, month: monthStart }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
      prismaPool[5].housekeepingUnitState.findMany({ where }),
      // A broad, unwindowed set so the Earnings card can filter by an
      // arbitrary Weekly/Monthly/Yearly period client-side instead of only
      // the fixed last-7-days/month-to-date slices above. No `take` cap —
      // there was one (500) until the total booking count (already 459,
      // growing ~100/month) got close enough to it that Yearly/older-period
      // Earnings totals were about to silently start dropping the oldest
      // bookings first (ordered desc by date), while Analytics' equivalent
      // query stayed uncapped — a real, imminent "the two tabs disagree"
      // bug, same class as the one just fixed for the historical-revenue
      // fallback. The whole dataset is still small enough (a few hundred
      // KB) to fetch in one query without a cap.
      prismaPool[6].booking.findMany({ where, orderBy: { date: "desc" }, select: dashboardBookingSelect }),
      // Weekly expenses aren't tied to a unit (salaries, ad spend, etc.) — used
      // for the Earnings "Salary" line. The full manual-entry editor now
      // lives on the Admin page's Weekly report tab.
      // ownerId — previously unscoped, silently folding every tenant's
      // TikTok-ads/salary entries into every owner's Earnings "Salary"
      // line (see the matching fix in analytics/queries.ts).
      prismaPool[7].weeklyExpense.findMany({ where: { ownerId }, orderBy: { date: "desc" }, take: 300, include: { targetEmployee: { select: { id: true, name: true, role: true } }, addedBy: { select: { id: true, name: true } } } }),
      // Feeds the "Needs your attention" card — every open (unresolved)
      // finding from the Auditor page. Positive findings are commendations,
      // not something needing action, so they're excluded here even though
      // they're still "a finding" on the Auditor page itself.
      prismaPool[8].auditFinding.findMany({
        where: { ...findingsWhere, resolved: false, severity: { in: ["Critical", "Warning", "Minor"] } },
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
        where: { date: { gte: monthStart, lt: nextMonthStart }, status: { in: ["APPROVED", "PENDING"] }, employee: { ownerId } },
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
      // Emergency access-code reserve pool + TTLock connection health — feeds
      // the "Emergency Access Codes" widget and its "no reserve codes left"
      // attention item. Small dataset (at most 10 rows/unit) either way.
      prismaPool[14 % prismaPool.length].reserveAccessCode.findMany({ where, select: { unitId: true, status: true } }),
      prismaPool[15 % prismaPool.length].ttlockStatus.findUnique({ where: { id: 1 } }),
      // Revenue Goals leaderboard baseline — minimal columns, previous
      // calendar month only.
      prismaPool[16 % prismaPool.length].booking.findMany({
        where: { ...where, date: { gte: prevMonthStart, lt: monthStart } },
        select: { unitId: true, date: true, amount: true, paid: true, dpAmount: true, refundedAt: true, bookerId: true },
      }),
      // billsRecent/expenseRequestsRecent — real paid-bill and approved-
      // expense history for the current month plus the 3 months before it,
      // for Key Metrics' "vs last month" / "vs 3-month benchmark"
      // comparisons. Paid-bill cost is attributed to a comparison period by
      // paidAt (the actual date money left), not the bill's `month` bucket
      // — a bill paid late in a different month than it's billed for would
      // otherwise misattribute cost to the wrong period.
      prismaPool[17 % prismaPool.length].bill.findMany({
        where: { ...where, month: { gte: benchmarkWindowStart, lt: nextMonthStart } },
        select: { unitId: true, month: true, paid: true, paidAt: true, amountDue: true, amountPaid: true, amountDueCentavos: true, amountPaidCentavos: true },
      }),
      prismaPool[18 % prismaPool.length].expenseRequest.findMany({
        where: { date: { gte: benchmarkWindowStart, lt: nextMonthStart }, status: { in: ["APPROVED", "PENDING"] }, employee: { ownerId } },
        select: { category: true, amount: true, status: true, date: true },
      }),
    ]);
    const [units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings, weeklyExpenses, attentionFindings, stocks, salaryHistory, expenseRequestsMonth, cleaningLogsRecent, calendarBlocksOccupancy, reserveAccessCodes, ttlockStatus, bookingsPrevMonth, billsRecent, expenseRequestsRecent] = res as any[];

    return JSON.parse(JSON.stringify({
      units, bookingsWeek, bookingsMonth, employees, bills, hkStates, earningsBookings,
      weeklyExpenses, attentionFindings, stocks, salaryHistory, expenseRequestsMonth, cleaningLogsRecent,
      calendarBlocksOccupancy, reserveAccessCodes, ttlockStatus, bookingsPrevMonth, billsRecent, expenseRequestsRecent,
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
