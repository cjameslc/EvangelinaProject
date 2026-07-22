import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope } from "@/lib/session";
import { bookingCancelSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";
import { rateLimit } from "@/lib/rateLimit";
import { canEditBookings, canEditSpecificBooking } from "@/lib/rbac";
import { notify } from "@/lib/bookingEngine/notificationService";

// Staff-side cancellation — the alternative to DELETE for a Booker, who can
// no longer hard-delete a booking (see canDeleteBookings in rbac.ts) but can
// still cancel one they logged, as long as they give a reason. Every other
// role canEditBookings() already covers can cancel too (same as edit), on
// top of also still having DELETE.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`booking-mutate:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const existing = await prisma.booking.findUnique({ where: { id: params.id }, select: { unitId: true, bookerId: true, cancelledAt: true } });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });
  if (user.role === "BOOKER") {
    const ownEmployee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!canEditSpecificBooking(user.role as any, existing.bookerId, ownEmployee?.id)) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  if (existing.cancelledAt) return NextResponse.json({ error: "This booking is already cancelled." }, { status: 400 });

  const parsed = parseOrError(bookingCancelSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const { reason } = parsed.data;

  const booking = await prisma.booking.update({
    where: { id: params.id },
    data: { cancelledAt: new Date(), cancellationReason: reason },
  });
  await logAudit(user.id, "booking.cancel", "Booking", booking.id, { reason });

  // A cancelled booking frees up the unit (availabilityService already
  // excludes cancelledAt bookings) — the mirrored CalendarBlock has to go
  // too, or /calendar keeps showing the unit as occupied for a slot that's
  // actually open again. Unlike hard DELETE, there's no onDelete: Cascade to
  // rely on here since the Booking row itself isn't being removed.
  await prisma.calendarBlock.deleteMany({ where: { bookingId: booking.id } });

  await notify({ type: "booking.cancelled", bookingId: booking.id });

  return NextResponse.json(booking);
}
