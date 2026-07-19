import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeBookings } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { CalendarView } from "@/components/calendar/CalendarView";

// Bills aren't shown here — see Dashboard's "Upcoming expenses" and Admin's
// Bills tab, the two places that own that data end to end.
export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeBookings(user.role)) redirect("/");

  const where = unitWhere(user);

  const [units, blocks] = await Promise.all([
    prisma.unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prisma.calendarBlock.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        unit: true,
        booking: {
          select: {
            platform: true, amount: true, paid: true, dpAmount: true,
            checkInTime: true, checkOutTime: true, pax: true, contactNumber: true,
            method: true, dpMethod: true,
            booker: { select: { name: true } },
            cleaner: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return (
    <CalendarView
      units={JSON.parse(JSON.stringify(units))}
      initialBlocks={JSON.parse(JSON.stringify(blocks))}
    />
  );
}
