import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeBookings } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { BookingsView } from "@/components/bookings/BookingsView";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeBookings(user.role)) redirect("/");

  const where = unitWhere(user);
  const [units, employees, bookings, settings] = await Promise.all([
    prisma.unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        unit: true,
        booker: { select: { id: true, name: true } },
        cleaner: { select: { id: true, name: true } },
        dpReceivedBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  return (
    <BookingsView
      role={user.role}
      units={JSON.parse(JSON.stringify(units))}
      employees={JSON.parse(JSON.stringify(employees))}
      initialBookings={JSON.parse(JSON.stringify(bookings))}
      defaultDpFee={settings.dpFee}
    />
  );
}
