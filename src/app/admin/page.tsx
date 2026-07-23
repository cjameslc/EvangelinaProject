import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeAdmin } from "@/lib/rbac";
import { prisma, prismaPool } from "@/lib/prisma";
import { CHECKLIST_GROUPS } from "@/lib/constants";
import { manilaMonthStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { computeFeedbackAnalytics } from "@/lib/bookingEngine/feedbackService";
import { AdminView } from "@/components/admin/AdminView";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAdmin(user.role)) redirect("/");

  const month = manilaMonthStart();
  await ensureRecurringBillsForMonth(month).catch(() => {});

  const [units, users, settings, loginLogs, bills, stocks, coupons, feedbackRows] = await Promise.all([
    prismaPool[0].unit.findMany({ orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { id: true, name: true } } } } } }),
    // Explicit select — excludes passwordHash. avatarUrl (a base64-encoded
    // profile photo) IS fetched here now so Users & roles shows each
    // person's real photo, not just initials — this business has a handful
    // of accounts, so the payload cost is small in practice even though a
    // single photo can run into the low single-digit MB.
    prismaPool[1].user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, username: true, email: true, role: true, avatarColor: true, avatarUrl: true,
        active: true, mustChangePassword: true, createdAt: true, showOnGuestGuide: true,
        ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } },
      },
    }),
    prismaPool[2].settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prismaPool[3].auditLog.findMany({
      where: { action: "user.login" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { actor: { select: { id: true, name: true, username: true, role: true } } },
    }),
    // Feeds the "Operations" tab's Bills view — same shape BillsPanel already expects from Housekeeping.
    prismaPool[4].bill.findMany({ where: { month }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
    // Feeds the "Operations" tab's Supplies view.
    prismaPool[5].stock.findMany({ orderBy: { name: "asc" } }),
    // Feeds the "Settings" tab's Coupons section.
    prismaPool[6].coupon.findMany({ orderBy: { createdAt: "desc" } }),
    // Feeds the "Feedback" tab — Guest Feedback & Rewards responses.
    prismaPool[7].feedbackResponse.findMany({
      orderBy: { createdAt: "desc" },
      include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } },
    }),
  ]);

  const safeSettings = { ...settings, checklistGroups: (settings.checklistGroups as typeof CHECKLIST_GROUPS | null) ?? CHECKLIST_GROUPS };
  const feedbackAnalytics = computeFeedbackAnalytics(feedbackRows);

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
    />
  );
}
