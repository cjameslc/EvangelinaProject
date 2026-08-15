import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeBookings, canRevealAccessCredential, canEditBookings } from "@/lib/rbac";
import { prismaPool } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { UnitCalendarView } from "@/components/calendar/UnitCalendarView";

// Same rich booking shape the main /calendar timeline already fetches
// (see src/app/calendar/page.tsx) — this page shows one unit's own slice
// of the exact same data, not a second source of truth.
const BLOCK_INCLUDE = {
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
} as const;

export default async function UnitCalendarPage({ params }: { params: { unitId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeBookings(user.role)) redirect("/");

  // Same window as the main /calendar Gantt page (6 months back, 13
  // forward) — these two surfaces show the same underlying data, so they
  // need the same fetch window or "not all data reflected" here becomes a
  // real, confusing bug whenever the two windows disagree.
  const windowStart = new Date();
  windowStart.setUTCMonth(windowStart.getUTCMonth() - 6, 1);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date();
  windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 13, 1);
  windowEnd.setUTCHours(0, 0, 0, 0);

  // Same architecture as the main /calendar Gantt page: fetch every unit
  // and every unit's blocks once, hand it all to one client component, and
  // let "which unit is focused" be plain client state from there — not a
  // per-unit route/page. Switching units used to navigate to a whole
  // different /calendar/[unitId] page, which the segment's loading.tsx
  // remounted on every switch (losing whatever month/week the user was on,
  // and round-tripping the server for data this page could have already
  // had in hand). Fetching every unit up front costs the same query this
  // page already ran per unit — just without the `unitId` filter — so this
  // is the same payload the main Gantt page pays for the same reason.
  // No `active` filter — matches every other unit-consuming page in the
  // app (Main Calendar, Bookings, Housekeeping, Social, Auditor all fetch
  // via plain unitIdWhere(user)). Filtering here would mean an inactive
  // unit's bookings still show on Main Calendar but the same unit vanishes
  // from Focus Calendar entirely — the exact "these two don't agree" bug.
  const [units, blocks] = await Promise.all([
    prismaPool[0].unit.findMany({
      where: unitIdWhere(user),
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, unitNumber: true, shortName: true, photoUrl: true, rating: true, nightlyRate: true, location: true },
    }),
    prismaPool[1].calendarBlock.findMany({
      where: { ...unitWhere(user), date: { gte: windowStart, lt: windowEnd } },
      orderBy: { date: "asc" },
      include: BLOCK_INCLUDE,
    }),
  ]);

  if (!units.some((u) => u.id === params.unitId)) notFound();

  return (
    <UnitCalendarView
      initialUnitId={params.unitId}
      allUnits={JSON.parse(JSON.stringify(units))}
      blocks={JSON.parse(JSON.stringify(blocks))}
      canRevealAccessCode={canRevealAccessCredential(user.role)}
      canGenerateAccessLink={user.role === "OWNER_ADMIN"}
      canDragReschedule={canEditBookings(user.role)}
    />
  );
}
