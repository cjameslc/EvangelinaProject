import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { hasActionAccess } from "@/lib/actionAccess";
import { rateLimit } from "@/lib/rateLimit";
import { checkAvailability, suggestAlternateUnits } from "@/lib/bookingEngine/availabilityService";
import { syncCalendarMirror } from "@/lib/calendarMirror";
import { notify } from "@/lib/bookingEngine/notificationService";

// GET: which of this booking's sibling units (same owner, active) are
// actually free for its exact window right now — powers the Bookings tab's
// "suggest an available unit" action on a flagged conflict. Read-only, no
// rate limit needed.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const existing = await prisma.booking.findUnique({ where: { id: params.id }, select: { unitId: true } });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);

  const units = await suggestAlternateUnits(params.id);
  return NextResponse.json({ units });
}

// POST { unitId }: moves this booking onto a different same-owner unit —
// staff resolving a flagged conflict (typically an Airbnb import that
// collided with a local booking; Airbnb has no visibility into our local
// bookings so it confirms these regardless of what's already on our books,
// see icalSync.ts) by relocating the guest to wherever's actually free,
// rather than leaving the reservation stuck unresolved. Deliberately a
// dedicated endpoint rather than routing this through the general booking
// PATCH: `conflict` isn't part of bookingSchema at all (it's system-managed,
// never client-settable) specifically so a raw API call can't paper over a
// real conflict without an actual re-verified availability check backing
// it — this route is the one place that check-then-clear is allowed to
// happen, and only as one atomic transaction.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("bookings.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`booking-mutate:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const targetUnitId = typeof body?.unitId === "string" ? body.unitId : null;
  if (!targetUnitId) return NextResponse.json({ error: "unitId is required." }, { status: 400 });

  const existing = await prisma.booking.findUnique({
    where: { id: params.id },
    select: {
      id: true, unitId: true, date: true, checkOutDate: true, stayType: true,
      checkInTime: true, checkOutTime: true, checkedOutAt: true, cancelledAt: true, guests: true,
      unit: { select: { ownerId: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (existing.cancelledAt) return NextResponse.json({ error: "This booking is cancelled." }, { status: 400 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);
  if (!await isUnitInScope(user, targetUnitId)) return forbiddenUnitScopeResponse(user);
  if (targetUnitId === existing.unitId) return NextResponse.json({ error: "Already assigned to that unit." }, { status: 400 });

  const targetUnit = await prisma.unit.findUnique({ where: { id: targetUnitId }, select: { id: true, ownerId: true, active: true } });
  if (!targetUnit || !targetUnit.active || targetUnit.ownerId !== existing.unit.ownerId) {
    return NextResponse.json({ error: "That unit isn't available to reassign to." }, { status: 400 });
  }

  class ReassignConflictError extends Error {}
  let booking;
  try {
    booking = await prisma.$transaction(async (tx) => {
      const { available } = await checkAvailability(
        { unitId: targetUnitId, date: existing.date, checkOutDate: existing.checkOutDate, stayType: existing.stayType as any, checkInTime: existing.checkInTime, checkOutTime: existing.checkOutTime },
        { excludeBookingId: existing.id, client: tx }
      );
      if (!available) throw new ReassignConflictError();
      return tx.booking.update({ where: { id: existing.id }, data: { unitId: targetUnitId, conflict: false } });
    });
  } catch (e) {
    if (e instanceof ReassignConflictError) {
      return NextResponse.json({ error: "That unit isn't actually free for this booking's dates anymore — try another." }, { status: 409 });
    }
    throw e;
  }

  await logAudit(user.id, "booking.reassignUnit", "Booking", booking.id, { before: { unitId: existing.unitId }, after: { unitId: targetUnitId } });
  await syncCalendarMirror(booking);
  await notify({ type: "booking.updated", bookingId: booking.id });

  return NextResponse.json(booking);
}
