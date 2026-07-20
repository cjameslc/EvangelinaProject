import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeHousekeeping } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { CHECKLIST_GROUPS } from "@/lib/constants";
import { manilaMonthStart, manilaDayStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { HousekeepingView } from "@/components/housekeeping/HousekeepingView";

export default async function HousekeepingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeHousekeeping(user.role)) redirect("/");

  const where = unitWhere(user);
  const month = manilaMonthStart();
  await ensureRecurringBillsForMonth(month).catch(() => {});

  // Cleaning-schedule window: today through the end of this week, plus a
  // few days of lookback so a multi-night stay that checked in earlier but
  // checks out today/tomorrow still shows up (checkout day is computed
  // client-side as checkOutDate ?? date, not filterable directly in SQL).
  const today = manilaDayStart();
  const scheduleFrom = new Date(today); scheduleFrom.setUTCDate(scheduleFrom.getUTCDate() - 3);
  const scheduleTo = new Date(today); scheduleTo.setUTCDate(scheduleTo.getUTCDate() + 7);

  const [units, states, logs, stocks, employees, openShift, bills, settings, upcomingBookings] = await Promise.all([
    prisma.unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prisma.housekeepingUnitState.findMany({ where }),
    prisma.cleaningLog.findMany({ where, orderBy: { startedAt: "desc" }, take: 30, include: { unit: { select: { name: true, shortName: true } } } }),
    prisma.stock.findMany({ where, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { active: true, role: { in: ["HOUSEKEEPING", "OWNER_ADMIN"] } } }),
    prisma.shift.findFirst({ where: { userId: user.id, clockOut: null } }),
    prisma.bill.findMany({ where: { ...where, month }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.booking.findMany({
      where: { ...where, date: { gte: scheduleFrom, lte: scheduleTo } },
      select: {
        id: true, unitId: true, date: true, checkOutDate: true, checkOutTime: true, stayType: true, guests: true,
        unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
        cleaner: { select: { id: true, name: true } },
      },
    }),
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
      upcomingBookings={JSON.parse(JSON.stringify(upcomingBookings))}
    />
  );
}
