import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeBookings } from "@/lib/rbac";
import { prismaPool } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { BookingsView } from "@/components/bookings/BookingsView";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeBookings(user.role)) redirect("/");

  const where = unitWhere(user);
  const [units, employees, bookings, settings, ownEmployee, hkStates] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prismaPool[1].employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    // Explicit select — BookingsView never reads proofUrl/dpProofUrl (the
    // base64-encoded receipt images, only ever uploaded via the edit form
    // and never displayed back), yet `include` was pulling them for every
    // booking on every page load. With real receipts attached this alone
    // was 6MB+ for a business with a literal handful of bookings — same fix
    // already applied to the Dashboard and Admin's booking reads.
    prismaPool[2].booking.findMany({
      where,
      orderBy: { date: "desc" },
      select: {
        id: true, unitId: true, date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true,
        guests: true, pax: true, contactNumber: true, bookerId: true, cleanerId: true, platform: true, platformOther: true,
        dpAmount: true, dpReceivedById: true, dpMethod: true, amount: true, receivedById: true, method: true, paid: true,
        source: true, conflict: true, checkedInAt: true, checkedOutAt: true, cancelledAt: true, cancellationReason: true, refundedAt: true, refundReason: true, notes: true,
        confirmationNumber: true,
        unit: { select: { id: true, name: true, unitNumber: true, shortName: true, nightlyRate: true, owners: { include: { user: { select: { name: true } } } } } },
        booker: { select: { id: true, name: true } },
        cleaner: { select: { id: true, name: true } },
        dpReceivedBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
      },
    }),
    prismaPool[3].settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prismaPool[4].employee.findUnique({ where: { userId: user.id }, select: { id: true } }),
    // Read-only room-readiness for the "Today's occupancy" card — Booker
    // already has canSeeBookings, no new RBAC surface needed for a read.
    prismaPool[5].housekeepingUnitState.findMany({ where, select: { unitId: true, status: true } }),
  ]);

  return (
    <BookingsView
      role={user.role}
      units={JSON.parse(JSON.stringify(units))}
      employees={JSON.parse(JSON.stringify(employees))}
      initialBookings={JSON.parse(JSON.stringify(bookings))}
      defaultDpFee={settings.dpFee}
      ownEmployeeId={ownEmployee?.id ?? null}
      hkStates={JSON.parse(JSON.stringify(hkStates))}
    />
  );
}
