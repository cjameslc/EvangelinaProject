import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeBookings } from "@/lib/rbac";
import { prismaPool } from "@/lib/prisma";
import { unitWhere, unitIdWhere } from "@/lib/session";
import { BookingsView } from "@/components/bookings/BookingsView";
import { ensureDefaultConversations, listConversationsForUser } from "@/lib/chat/service";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeBookings(user.role)) redirect("/");

  // Team Collaboration panel reuses the same chat backend the standalone
  // /chat page used — ensureDefaultConversations is idempotent (a no-op
  // once the Team channel already exists), same call the old chat page made.
  await ensureDefaultConversations();

  const where = unitWhere(user);

  // Default window: recent + all future bookings, not the account's entire
  // history — staff mostly work with what's upcoming/recent, and this is
  // what keeps page load fast as the business logs more bookings over time
  // (a real load test showed load time growing with total history size
  // when unbounded). Nothing is hidden: BookingsView's "Show older
  // bookings" trigger re-fetches unbounded on demand, and refresh() after
  // a mutation re-requests whatever window is already loaded.
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);
  ninetyDaysAgo.setUTCHours(0, 0, 0, 0);
  const sinceIso = ninetyDaysAgo.toISOString().slice(0, 10);

  const [units, employees, bookings, settings, ownEmployee, hkStates, conversations, firstBookingRows] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, include: { owners: { include: { user: { select: { name: true } } } } } }),
    prismaPool[1].employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    // Explicit select — BookingsView never reads proofUrl/dpProofUrl (the
    // base64-encoded receipt images, only ever uploaded via the edit form
    // and never displayed back), yet `include` was pulling them for every
    // booking on every page load. With real receipts attached this alone
    // was 6MB+ for a business with a literal handful of bookings — same fix
    // already applied to the Dashboard and Admin's booking reads.
    prismaPool[2].booking.findMany({
      where: { ...where, date: { gte: ninetyDaysAgo } },
      orderBy: { date: "desc" },
      select: {
        id: true, unitId: true, date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true,
        guests: true, pax: true, contactNumber: true, bookerId: true, cleanerId: true, platform: true, platformOther: true,
        dpAmount: true, dpReceivedById: true, dpMethod: true, amount: true, receivedById: true, method: true, paid: true,
        source: true, conflict: true, checkedInAt: true, checkedOutAt: true, cancelledAt: true, cancellationReason: true, cancellationCategory: true, refundedAt: true, refundReason: true, notes: true,
        confirmationNumber: true, confirmationOverrideUntil: true,
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
    listConversationsForUser(user.id),
    // "1st booking" tag needs real all-time data (a guest's very first
    // stay could easily be older than the 90-day window above), but only
    // ever needs a Set of ids — a lean select over the full history is far
    // cheaper than shipping every historical booking's full row just for
    // this one badge. Computed here, not in BookingsView, so the client
    // never holds more than a Set<string> of the answer.
    prismaPool[6].booking.findMany({
      where: { ...where, cancelledAt: null },
      orderBy: { date: "asc" },
      select: { id: true, date: true, contactNumber: true, guests: true },
    }),
  ]);

  const firstBookingIds = (() => {
    const byGuest = new Map<string, { id: string; date: Date }>();
    for (const b of firstBookingRows) {
      const contact = b.contactNumber?.trim();
      const key = contact && contact.toLowerCase() !== "not provided" ? contact : ((b.guests as string[]).join(",").toLowerCase() || b.id);
      const existing = byGuest.get(key);
      if (!existing || b.date < existing.date) byGuest.set(key, { id: b.id, date: b.date });
    }
    return Array.from(byGuest.values(), (v) => v.id);
  })();

  return (
    <BookingsView
      role={user.role}
      currentUserId={user.id}
      initialConversations={JSON.parse(JSON.stringify(conversations))}
      units={JSON.parse(JSON.stringify(units))}
      employees={JSON.parse(JSON.stringify(employees))}
      initialBookings={JSON.parse(JSON.stringify(bookings))}
      initialSinceIso={sinceIso}
      initialFirstBookingIds={firstBookingIds}
      defaultDpFee={settings.dpFee}
      ownEmployeeId={ownEmployee?.id ?? null}
      hkStates={JSON.parse(JSON.stringify(hkStates))}
      rates={{
        weekdayRate12h: settings.weekdayRate12h,
        weekdayRate21h: settings.weekdayRate21h,
        weekendRate12h: settings.weekendRate12h,
        weekendRate21h: settings.weekendRate21h,
        weekdayNightPromoPct: settings.weekdayNightPromoPct,
        flexibleTimeFee: settings.flexibleTimeFee,
      }}
      dailyRevenueGoal={settings.dailyRevenueGoal}
    />
  );
}
