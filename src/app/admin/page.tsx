import { redirect } from "next/navigation";
import { getCurrentUser, unitWhere, unitIdWhere } from "@/lib/session";
import { canSeeAdmin } from "@/lib/rbac";
import { prisma, prismaPool } from "@/lib/prisma";
import { CHECKLIST_GROUPS } from "@/lib/constants";
import { manilaMonthStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { computeFeedbackAnalytics } from "@/lib/bookingEngine/feedbackService";
import { GUIDEBOOK_CATEGORIES, type GuidebookCategory } from "@/lib/guidebookContent";
import { AdminView } from "@/components/admin/AdminView";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAdmin(user.role)) redirect("/");

  const month = manilaMonthStart();
  await ensureRecurringBillsForMonth(month).catch(() => {});

  // Multi-owner tenant boundary (see src/lib/ownerScope.ts) — Unit/User/
  // Bill/Stock/Coupon/FeedbackResponse/AuditLog(login+housekeeping) are all
  // scoped below; ImpersonationSession is scoped after the fetch (see
  // scopedImpersonationLogs) since it has no relation column to filter
  // through. checkCoupon() at actual guest checkout is the one remaining
  // gap (see the Coupon model's doc comment in schema.prisma) — this only
  // covers the Admin list/create/edit/delete paths.
  const [units, users, settings, loginLogs, bills, stocks, coupons, feedbackRows, placeSummaryRows, impersonationLogs, housekeepingActivityLogs] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { id: true, name: true } } } } } }),
    // Explicit select — excludes passwordHash. avatarUrl (a base64-encoded
    // profile photo) IS fetched here now so Users & roles shows each
    // person's real photo, not just initials — this business has a handful
    // of accounts, so the payload cost is small in practice even though a
    // single photo can run into the low single-digit MB.
    prismaPool[1].user.findMany({
      where: { ownerId: user.ownerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, username: true, email: true, role: true, avatarColor: true, avatarUrl: true,
        active: true, mustChangePassword: true, createdAt: true, showOnGuestGuide: true,
        ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } },
      },
    }),
    prismaPool[2].settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prismaPool[3].auditLog.findMany({
      where: { action: "user.login", actor: { ownerId: user.ownerId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { actor: { select: { id: true, name: true, username: true, role: true } } },
    }),
    // Feeds the "Operations" tab's Bills view — same shape BillsPanel already expects from Housekeeping.
    prismaPool[4].bill.findMany({ where: { ...unitWhere(user), month }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
    // Feeds the "Operations" tab's Supplies view.
    prismaPool[5].stock.findMany({ where: unitWhere(user), orderBy: { name: "asc" } }),
    // Feeds the "Settings" tab's Coupons section.
    prismaPool[6].coupon.findMany({ where: { ownerId: user.ownerId }, orderBy: { createdAt: "desc" } }),
    // Feeds the "Feedback" tab — Guest Feedback & Rewards responses.
    prismaPool[7].feedbackResponse.findMany({
      where: { unit: { ownerId: user.ownerId } },
      orderBy: { createdAt: "desc" },
      include: {
        unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
        booking: { select: { platform: true } },
      },
    }),
    // Feeds the Settings tab's "Nearby places data" refresh panel — one
    // row per category that's been refreshed at least once.
    prismaPool[8].placeInsight.groupBy({ by: ["category"], _count: { _all: true }, _max: { lastFetchedAt: true } }),
    // Feeds the Settings tab's "Security" section — Impersonation Logs.
    // ImpersonationSession has no direct relation to User (adminUserId/
    // targetUserId are plain strings), so this can't be a nested-relation
    // filter like the AuditLog ones above — filtered by owner below, after
    // the fact, against this owner's real user ids.
    prismaPool[9 % prismaPool.length].impersonationSession.findMany({ orderBy: { startedAt: "desc" }, take: 300 }),
    // Feeds the Settings tab's "Housekeeping activity log" — Housekeeping
    // Workforce Management spec section 15. One combined timeline over
    // AuditLog rather than a bespoke log table (see access/service.ts and
    // this feature's other write paths, which all already call the
    // existing logAudit()).
    prismaPool[10 % prismaPool.length].auditLog.findMany({
      where: { action: { in: ["housekeeping.update", "shift.clockin", "shift.clockout", "access.credential.generated", "access.credential.viewed", "access.credential.copied", "access.credential.revoked", "access.credential.expired", "access.credential.failed"] }, actor: { ownerId: user.ownerId } },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { actor: { select: { id: true, name: true, username: true, role: true } } },
    }),
  ]);

  // ImpersonationSession has no relation column to filter through — scope
  // it after the fact against this owner's real user ids (both the actor
  // and the target must belong to this owner; an OWNER_ADMIN's session
  // can only ever have impersonated their own staff anyway, but this is
  // the explicit check rather than an assumption).
  const ownerUserIds = new Set(users.map((u) => u.id));
  const scopedImpersonationLogs = impersonationLogs.filter(
    (log) => ownerUserIds.has(log.adminUserId) || ownerUserIds.has(log.targetUserId)
  );

  const safeSettings = { ...settings, checklistGroups: (settings.checklistGroups as typeof CHECKLIST_GROUPS | null) ?? CHECKLIST_GROUPS };
  const feedbackAnalytics = computeFeedbackAnalytics(feedbackRows);
  const guidebookCategories = (settings.guidebookCategories as unknown as GuidebookCategory[] | null) ?? GUIDEBOOK_CATEGORIES;
  const placeInsightSummary = placeSummaryRows.map((r) => ({ category: r.category, count: r._count._all, lastFetchedAt: r._max.lastFetchedAt }));

  return (
    <AdminView
      units={JSON.parse(JSON.stringify(units))}
      users={JSON.parse(JSON.stringify(users))}
      settings={JSON.parse(JSON.stringify(safeSettings))}
      loginLogs={JSON.parse(JSON.stringify(loginLogs))}
      bills={JSON.parse(JSON.stringify(bills))}
      stocks={JSON.parse(JSON.stringify(stocks))}
      coupons={JSON.parse(JSON.stringify(coupons))}
      feedback={JSON.parse(JSON.stringify(feedbackRows))}
      feedbackAnalytics={JSON.parse(JSON.stringify(feedbackAnalytics))}
      guidebookCategories={JSON.parse(JSON.stringify(guidebookCategories))}
      placeInsightSummary={JSON.parse(JSON.stringify(placeInsightSummary))}
      impersonationLogs={JSON.parse(JSON.stringify(scopedImpersonationLogs))}
      housekeepingActivityLogs={JSON.parse(JSON.stringify(housekeepingActivityLogs))}
    />
  );
}
