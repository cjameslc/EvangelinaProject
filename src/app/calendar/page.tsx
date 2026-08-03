import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeBookings } from "@/lib/rbac";
import { prismaPool } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { CalendarView } from "@/components/calendar/CalendarView";

// Bills aren't shown here — see Dashboard's "Upcoming expenses" and Admin's
// Bills tab, the two places that own that data end to end.
export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeBookings(user.role)) redirect("/");

  const where = unitWhere(user);

  // Two separate pool clients, not the shared `prisma` singleton — the
  // libSQL adapter serializes every query on one client behind an internal
  // mutex (see prisma.ts), so wrapping the same client's calls in
  // Promise.all here didn't actually run them concurrently. Matches the
  // pattern already used in bookings/page.tsx.
  const [units, blocks] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prismaPool[1].calendarBlock.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        unit: { select: { id: true, name: true, unitNumber: true, shortName: true } },
        booking: {
          select: {
            id: true, confirmationNumber: true,
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
      role={user.role}
      units={JSON.parse(JSON.stringify(units))}
      initialBlocks={JSON.parse(JSON.stringify(blocks))}
    />
  );
}
