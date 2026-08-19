import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { effectivePageAccess } from "@/lib/pageAccess";
import { prismaPool } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { CHECKLIST_GROUPS } from "@/lib/constants";
import { manilaMonthStart, manilaDayStart } from "@/lib/format";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";
import { HousekeepingView } from "@/components/housekeeping/HousekeepingView";

export default async function HousekeepingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!effectivePageAccess(user.role, user.additionalPageAccess, user.ownerEnabledModules).includes("/housekeeping")) redirect("/");

  const where = unitWhere(user);
  const month = manilaMonthStart();
  await ensureRecurringBillsForMonth(month, user.ownerId).catch(() => {});

  // Cleaning-schedule window: today through the end of this week, plus a
  // few days of lookback so a multi-night stay that checked in earlier but
  // checks out today/tomorrow still shows up (checkout day is computed
  // client-side as checkOutDate ?? date, not filterable directly in SQL).
  const today = manilaDayStart();
  const scheduleFrom = new Date(today); scheduleFrom.setUTCDate(scheduleFrom.getUTCDate() - 3);
  const scheduleTo = new Date(today); scheduleTo.setUTCDate(scheduleTo.getUTCDate() + 7);

  // Separate pool clients, not the shared `prisma` singleton — the libSQL
  // adapter serializes every query on one client behind an internal mutex
  // (see prisma.ts), so these 10 queries ran back-to-back over the network
  // despite the Promise.all wrapper. Matches the pattern already used in
  // bookings/page.tsx.
  const [units, states, logs, stocks, employees, openShift, bills, settings, upcomingBookings, housekeepingOpenShifts, meterReadings] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prismaPool[1].housekeepingUnitState.findMany({ where }),
    prismaPool[2].cleaningLog.findMany({ where, orderBy: { startedAt: "desc" }, take: 30, include: { unit: { select: { name: true, shortName: true, unitNumber: true } } } }),
    prismaPool[3].stock.findMany({ where, orderBy: { name: "asc" } }),
    prismaPool[4].employee.findMany({ where: { active: true, role: { in: ["HOUSEKEEPING", "OWNER_ADMIN"] }, ownerId: user.ownerId } }),
    prismaPool[5].shift.findFirst({ where: { userId: user.id, clockOut: null } }),
    prismaPool[6].bill.findMany({ where: { ...where, month }, include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } } }),
    prismaPool[7].settings.upsert({ where: { ownerId: user.ownerId! }, update: {}, create: { ownerId: user.ownerId! } }),
    prismaPool[8].booking.findMany({
      // cancelledAt: null — was missing, so a cancelled booking still showed
      // up as a real checkout needing cleaning, letting a housekeeper "Mark
      // clean" for a guest who never actually stayed. Confirmed against real
      // data: a booking cancelled 2026-08-03 still generated a Cleaning
      // CalendarBlock on 2026-08-04, showing as a second, spurious "Cleaned"
      // tile on /calendar alongside that day's real checkout.
      where: { ...where, date: { gte: scheduleFrom, lte: scheduleTo }, cancelledAt: null },
      select: {
        id: true, unitId: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true, stayType: true, platform: true, guests: true,
        unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
        cleaner: { select: { id: true, name: true } },
      },
    }),
    // Feeds the Owner/Admin/Co-owner "Housekeeping status" roster — every
    // currently clocked-in Housekeeping user, not just the viewer's own
    // shift (which is all `openShift` above ever covers, and is meaningless
    // for a role that doesn't clock in itself).
    prismaPool[9].shift.findMany({
      where: { clockOut: null, user: { role: "HOUSEKEEPING", ownerId: user.ownerId } },
      select: { id: true, clockIn: true, user: { select: { id: true, name: true } } },
      orderBy: { clockIn: "asc" },
    }),
    prismaPool[10].meterReading.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
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
      initialMeterReadings={JSON.parse(JSON.stringify(meterReadings))}
      checklistGroups={JSON.parse(JSON.stringify(checklistGroups))}
      upcomingBookings={JSON.parse(JSON.stringify(upcomingBookings))}
      housekeepingOpenShifts={JSON.parse(JSON.stringify(housekeepingOpenShifts))}
    />
  );
}
