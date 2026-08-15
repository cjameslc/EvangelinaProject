import { prisma } from "@/lib/prisma";

// Every booking-lifecycle event funnels through here — one seam. Persists
// an in-app GuestNotification when the booking belongs to a Guest Portal
// account (guestId set); a no-op for staff-only bookings, which have no
// guest inbox to write to. Real push delivery (the empty push/
// notificationclick stubs already in public/sw.js) plugs in later without
// any caller needing to change — they already all call notify(), not
// "write a row" or "send a push" directly.
export type NotificationEvent =
  | { type: "booking.created"; bookingId: string }
  | { type: "booking.updated"; bookingId: string }
  | { type: "booking.cancelled"; bookingId: string }
  | { type: "payment.received"; bookingId: string }
  | { type: "checkin.reminder"; bookingId: string }
  | { type: "checkout.reminder"; bookingId: string };

const MESSAGES: Record<NotificationEvent["type"], string> = {
  "booking.created": "Your booking request was received.",
  "booking.updated": "Your booking details were updated.",
  "booking.cancelled": "Your booking was cancelled.",
  "payment.received": "We've confirmed your payment.",
  "checkin.reminder": "Your check-in is coming up soon.",
  "checkout.reminder": "Your check-out is coming up soon.",
};

// A duplicate call for the same real event (a request handler retried, a
// double-submit that slipped past the booking-level guard) must not double-
// notify the guest — but the same (guestId, type, bookingId) triple can
// legitimately recur much later for real reasons (a booking rebooked and
// cancelled again days after its first cancellation), so this only
// suppresses a genuine near-duplicate, not every repeat ever.
const DEDUP_WINDOW_MS = 60_000;

export async function notify(event: NotificationEvent): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[notify] ${event.type}`, event);

  try {
    const booking = await prisma.booking.findUnique({ where: { id: event.bookingId }, select: { guestId: true } });
    if (!booking?.guestId) return;
    const recentDuplicate = await prisma.guestNotification.findFirst({
      where: {
        guestId: booking.guestId,
        type: event.type,
        bookingId: event.bookingId,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recentDuplicate) return;
    await prisma.guestNotification.create({
      data: { guestId: booking.guestId, type: event.type, message: MESSAGES[event.type], bookingId: event.bookingId },
    });
  } catch {
    // A notification failure must never break the booking operation that triggered it.
  }
}

// Staff-facing counterpart — Housekeeping Workforce Management events only
// (nothing else in the app has an Owner/Booker inbox to write to yet).
// Deliberately a *separate* function from notify() above rather than one
// union: notify()'s target resolution is "the booking's own guest";
// notifyStaff's is "whoever manages this unit," a genuinely different
// lookup, not just a different payload shape.
export type StaffNotificationEvent =
  | { type: "cleaning.started"; unitId: string; unitName: string; employeeName: string; bookerId?: string }
  | { type: "cleaning.late"; unitId: string; unitName: string; employeeName: string; minutesLate: number; bookerId?: string }
  | { type: "cleaning.overdue"; unitId: string; unitName: string; employeeName: string; bookerId?: string }
  | { type: "cleaning.completed"; unitId: string; unitName: string; employeeName: string; durationMinutes: number; bookerId?: string }
  | { type: "code.generated"; unitId: string; unitName: string; employeeName: string }
  | { type: "code.expiring"; unitId: string; unitName: string; employeeName: string }
  | { type: "code.copied"; unitId: string; unitName: string; employeeName: string }
  | { type: "employee.autologout"; employeeName: string }
  | { type: "security.unauthorized_access"; unitId: string; unitName: string; classification: string; severity: string };

function staffMessage(event: StaffNotificationEvent): string {
  switch (event.type) {
    case "cleaning.started": return `${event.employeeName} started cleaning ${event.unitName}.`;
    case "cleaning.late": return `${event.employeeName} started cleaning ${event.unitName} ${event.minutesLate} min late.`;
    case "cleaning.overdue": return `${event.employeeName}'s clean at ${event.unitName} has passed the 2-hour max.`;
    case "cleaning.completed": return `${event.employeeName} finished cleaning ${event.unitName} (${event.durationMinutes} min).`;
    case "code.generated": return `A temporary access code was generated for ${event.employeeName} at ${event.unitName}.`;
    case "code.expiring": return `${event.employeeName}'s access code for ${event.unitName} is about to expire.`;
    case "code.copied": return `${event.employeeName} copied their access code for ${event.unitName}.`;
    case "employee.autologout": return `${event.employeeName} was automatically logged out at end of shift.`;
    case "security.unauthorized_access": {
      const label = event.severity === "CRITICAL" ? "🚨 Unauthorized access" : "⚠️ Suspicious access";
      return `${label} detected at ${event.unitName} — ${event.classification.replace(/_/g, " ").toLowerCase()}. Check Security Monitor.`;
    }
  }
}

/** Every OWNER_ADMIN, plus any CO_OWNER whose portfolio includes this unit
 * (UnitOwner) — the same "who manages this unit" population the rest of
 * the app already scopes dashboards/bookings to (see unitScope in rbac.ts),
 * reused here instead of inventing a separate notify-list concept. Unit-less
 * events (e.g. auto-logout) go to every OWNER_ADMIN only. */
async function resolveStaffTargets(unitId?: string, bookerId?: string): Promise<string[]> {
  const owners = await prisma.user.findMany({ where: { role: "OWNER_ADMIN", active: true }, select: { id: true } });
  const ids = new Set(owners.map((o) => o.id));
  if (unitId) {
    const coOwners = await prisma.unitOwner.findMany({
      where: { unitId, user: { role: "CO_OWNER", active: true } },
      select: { userId: true },
    });
    coOwners.forEach((c) => ids.add(c.userId));
  }
  if (bookerId) {
    const booker = await prisma.employee.findUnique({ where: { id: bookerId }, select: { userId: true, active: true } });
    if (booker?.userId && booker.active) ids.add(booker.userId);
  }
  return [...ids];
}

export async function notifyStaff(event: StaffNotificationEvent): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[notifyStaff] ${event.type}`, event);
  try {
    const unitId = "unitId" in event ? event.unitId : undefined;
    const bookerId = "bookerId" in event ? event.bookerId : undefined;
    const targets = await resolveStaffTargets(unitId, bookerId);
    if (targets.length === 0) return;
    const message = staffMessage(event);
    await prisma.$transaction(
      targets.map((userId) =>
        prisma.staffNotification.create({ data: { userId, type: event.type, message, unitId: unitId ?? null } })
      )
    );
  } catch {
    // Same contract as notify() — never break the operation that triggered it.
  }
}
