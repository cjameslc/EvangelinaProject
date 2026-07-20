import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeAdmin } from "@/lib/rbac";
import { prisma, prismaPool } from "@/lib/prisma";
import { CHECKLIST_GROUPS } from "@/lib/constants";
import { manilaMonthStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { AdminView } from "@/components/admin/AdminView";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAdmin(user.role)) redirect("/");

  const month = manilaMonthStart();
  await ensureRecurringBillsForMonth(month).catch(() => {});

  const [units, users, settings, loginLogs, weeklyReportBookings, employees, weeklyExpenses, cleaningLogs, bills, stocks] = await Promise.all([
    prismaPool[0].unit.findMany({ orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { id: true, name: true } } } } } }),
    // Explicit select — UsersTab never reads avatarUrl (a base64-encoded
    // profile photo, only used on the owning user's own Navbar/Profile
    // page) or passwordHash, yet both used to be fetched for every account
    // here. One seeded test account's avatarUrl alone was 3.4MB.
    prismaPool[1].user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, username: true, email: true, role: true, avatarColor: true,
        active: true, mustChangePassword: true, createdAt: true,
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
    // Feeds the "Weekly report" tab below — Admin sees every unit, so no
    // scoping. Explicit `select` (not `include`) so this never pulls
    // proofUrl/dpProofUrl — the base64-encoded receipt images, only needed
    // on the Bookings page's own edit modal — which was previously fetched
    // in full for all 200 rows here despite WeeklyReport/StaffTab never
    // reading either field.
    prismaPool[4].booking.findMany({
      orderBy: { date: "desc" },
      take: 200,
      select: {
        id: true, date: true, checkOutDate: true, checkOutTime: true, unitId: true, guests: true, pax: true,
        platform: true, stayType: true, amount: true, paid: true, method: true, dpAmount: true, dpMethod: true,
        unit: { select: { id: true, name: true, shortName: true, unitNumber: true, owners: { include: { user: { select: { name: true } } } } } },
        booker: { select: { id: true, name: true, role: true } },
        receivedBy: { select: { id: true, name: true, role: true } },
        dpReceivedBy: { select: { id: true, name: true, role: true } },
        cleaner: { select: { id: true, name: true, role: true } },
      },
    }),
    prismaPool[5].employee.findMany({ where: { active: true } }),
    prismaPool[6].weeklyExpense.findMany({
      orderBy: { date: "desc" },
      take: 300,
      include: {
        targetEmployee: { select: { id: true, name: true, role: true } },
        addedBy: { select: { id: true, name: true } },
      },
    }),
    prismaPool[7].cleaningLog.findMany({ orderBy: { startedAt: "desc" }, take: 500, select: { id: true, employeeId: true, unitId: true, startedAt: true } }),
    // Feeds the "Bills" tab — same shape BillsPanel already expects from Housekeeping.
    prismaPool[8].bill.findMany({ where: { month }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
    // Feeds the "Supplies" tab.
    prismaPool[9].stock.findMany({ orderBy: { name: "asc" } }),
  ]);

  const safeSettings = { ...settings, checklistGroups: (settings.checklistGroups as typeof CHECKLIST_GROUPS | null) ?? CHECKLIST_GROUPS };

  return (
    <AdminView
      units={JSON.parse(JSON.stringify(units))}
      users={JSON.parse(JSON.stringify(users))}
      settings={JSON.parse(JSON.stringify(safeSettings))}
      loginLogs={JSON.parse(JSON.stringify(loginLogs))}
      weeklyReportBookings={JSON.parse(JSON.stringify(weeklyReportBookings))}
      employees={JSON.parse(JSON.stringify(employees))}
      weeklyExpenses={JSON.parse(JSON.stringify(weeklyExpenses))}
      cleaningLogs={JSON.parse(JSON.stringify(cleaningLogs))}
      canEditExpenses={user.role === "OWNER_ADMIN"}
      bills={JSON.parse(JSON.stringify(bills))}
      stocks={JSON.parse(JSON.stringify(stocks))}
    />
  );
}
