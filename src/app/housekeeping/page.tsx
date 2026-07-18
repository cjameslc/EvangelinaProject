import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeHousekeeping } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { CHECKLIST_GROUPS } from "@/lib/constants";
import { HousekeepingView } from "@/components/housekeeping/HousekeepingView";

export default async function HousekeepingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeHousekeeping(user.role)) redirect("/");

  const where = unitWhere(user);
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1);

  const [units, states, logs, stocks, employees, openShift, bills, settings] = await Promise.all([
    prisma.unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prisma.housekeepingUnitState.findMany({ where, include: { unit: true } }),
    prisma.cleaningLog.findMany({ where, orderBy: { startedAt: "desc" }, take: 30, include: { unit: { select: { name: true, shortName: true } } } }),
    prisma.stock.findMany({ where, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { active: true, role: { in: ["HOUSEKEEPING", "OWNER_ADMIN"] } } }),
    prisma.shift.findFirst({ where: { userId: user.id, clockOut: null } }),
    prisma.bill.findMany({ where: { ...where, month }, include: { unit: true } }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  const checklistGroups = (settings.checklistGroups as typeof CHECKLIST_GROUPS | null) ?? CHECKLIST_GROUPS;

  return (
    <HousekeepingView
      role={user.role}
      units={JSON.parse(JSON.stringify(units))}
      initialStates={JSON.parse(JSON.stringify(states))}
      initialLogs={JSON.parse(JSON.stringify(logs))}
      initialStocks={JSON.parse(JSON.stringify(stocks))}
      employees={JSON.parse(JSON.stringify(employees))}
      initialShift={JSON.parse(JSON.stringify(openShift))}
      initialBills={JSON.parse(JSON.stringify(bills))}
      checklistGroups={JSON.parse(JSON.stringify(checklistGroups))}
    />
  );
}
