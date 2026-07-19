import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { bookingSchema, normalizeStayTypeForPlatform } from "@/lib/validation";
import { canEditBookings } from "@/lib/rbac";
import { syncCalendarMirror, bookingsConflict } from "@/lib/calendarMirror";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const body = bookingSchema.partial().parse(await req.json());
  const data: any = { ...body };
  if (body.date) data.date = new Date(body.date);
  if (body.checkOutDate !== undefined) data.checkOutDate = body.checkOutDate ? new Date(body.checkOutDate) : null;

  // Same range-overlap guard as creating a booking — re-checked against every
  // other booking on the unit whenever the date range or stay type changes,
  // so an edit can't silently create a double-booking either.
  const nextUnitId = data.unitId ?? existing.unitId;
  const nextDate = data.date ?? existing.date;
  const nextCheckOutDate = "checkOutDate" in data ? data.checkOutDate : existing.checkOutDate;
  const nextPlatform = data.platform ?? existing.platform;
  const nextStayType = normalizeStayTypeForPlatform(nextPlatform, data.stayType ?? existing.stayType);
  data.stayType = nextStayType;
  const others = await prisma.booking.findMany({
    where: { unitId: nextUnitId, id: { not: params.id } },
    select: { stayType: true, date: true, checkOutDate: true },
  });
  const conflict = others.some((b) => bookingsConflict({ stayType: nextStayType, date: nextDate, checkOutDate: nextCheckOutDate }, b));
  if (conflict) {
    return NextResponse.json({ error: "This unit already has a booking that overlaps this date and stay type." }, { status: 409 });
  }

  const booking = await prisma.booking.update({ where: { id: params.id }, data });
  await logAudit(user.id, "booking.update", "Booking", booking.id, body);

  // Keep the mirrored calendar entry (date/span/type/guest) in sync so an
  // edited booking always shows on its exact — and correctly spanned —
  // date(s) on the /calendar grid, rather than the stale one it had before.
  await syncCalendarMirror(booking);

  return NextResponse.json(booking);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  // The mirrored CalendarBlock cascades away with it (onDelete: Cascade on
  // the bookingId relation), so /calendar never shows an orphaned entry.
  await prisma.booking.delete({ where: { id: params.id } });
  await logAudit(user.id, "booking.delete", "Booking", params.id);
  return NextResponse.json({ ok: true });
}
