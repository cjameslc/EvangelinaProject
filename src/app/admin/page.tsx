import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
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
    prisma.unit.findMany({ orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { id: true, name: true } } } } } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } } } }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.auditLog.findMany({
      where: { action: "user.login" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { actor: { select: { id: true, name: true, username: true, role: true } } },
    }),
    // Feeds the "Weekly report" tab below — Admin sees every unit, so no scoping.
    prisma.booking.findMany({
      orderBy: { date: "desc" },
      take: 200,
      include: {
        unit: { select: { id: true, name: true, shortName: true, unitNumber: true, owners: { include: { user: { select: { name: true } } } } } },
        booker: { select: { id: true, name: true, role: true } },
        receivedBy: { select: { id: true, name: true, role: true } },
        dpReceivedBy: { select: { id: true, name: true, role: true } },
        cleaner: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.employee.findMany({ where: { active: true } }),
    prisma.weeklyExpense.findMany({ orderBy: { date: "desc" }, take: 300, include: { targetEmployee: { select: { id: true, name: true, role: true } } } }),
    prisma.cleaningLog.findMany({ orderBy: { startedAt: "desc" }, take: 500, select: { id: true, employeeId: true, unitId: true, startedAt: true } }),
    // Feeds the "Bills" tab — same shape BillsPanel already expects from Housekeeping.
    prisma.bill.findMany({ where: { month }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
    // Feeds the "Supplies" tab.
    prisma.stock.findMany({ orderBy: { name: "asc" } }),
  ]);

  const safeUsers = users.map(({ passwordHash, ...u }) => u);
  const safeSettings = { ...settings, checklistGroups: (settings.checklistGroups as typeof CHECKLIST_GROUPS | null) ?? CHECKLIST_GROUPS };

  return (
    <AdminView
      units={JSON.parse(JSON.stringify(units))}
      users={JSON.parse(JSON.stringify(safeUsers))}
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
