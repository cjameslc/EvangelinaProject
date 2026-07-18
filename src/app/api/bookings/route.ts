import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere, logAudit } from "@/lib/session";
import { bookingSchema } from "@/lib/validation";
import { canEditBookings } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const bookings = await prisma.booking.findMany({
    where: unitWhere(user),
    orderBy: { date: "desc" },
    include: {
      unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
      booker: { select: { id: true, name: true } },
      cleaner: { select: { id: true, name: true } },
      dpReceivedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(bookings);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const body = bookingSchema.parse(await req.json());

  // Overlap guard: Daycation and Night stay may share the same date (they run
  // in separate time slots), but a Full stay blocks the whole day, and two
  // bookings of the same slot on the same unit/date always conflict.
  const dayStart = new Date(body.date);
  const sameDay = await prisma.booking.findMany({
    where: { unitId: body.unitId, date: dayStart },
    select: { stayType: true },
  });
  const conflict = sameDay.some((b) => {
    if (body.stayType === "Full" || b.stayType === "Full") return true;
    return b.stayType === body.stayType;
  });
  if (conflict) {
    return NextResponse.json({ error: "This unit already has a booking that overlaps this date and stay type." }, { status: 409 });
  }

  const booking = await prisma.booking.create({
    data: {
      unitId: body.unitId,
      date: dayStart,
      checkOutDate: body.checkOutDate ? new Date(body.checkOutDate) : null,
      stayType: body.stayType,
      checkInTime: body.checkInTime || null,
      checkOutTime: body.checkOutTime || null,
      guests: body.guests,
      pax: body.pax ?? null,
      contactNumber: body.contactNumber,
      bookerId: body.bookerId || null,
      cleanerId: body.cleanerId || null,
      platform: body.platform,
      platformOther: body.platformOther || null,
      dpAmount: body.dpAmount ?? null,
      dpReceivedById: body.dpReceivedById || null,
      dpMethod: body.dpMethod || null,
      dpProofUrl: body.dpProofUrl || null,
      amount: body.amount,
      receivedById: body.receivedById || null,
      method: body.method || null,
      proofUrl: body.proofUrl || null,
      paid: body.paid ?? false,
    },
  });

  // Mirror onto the calendar so /calendar shows it immediately.
  await prisma.calendarBlock.create({
    data: {
      unitId: booking.unitId,
      type: booking.stayType,
      date: booking.date,
      guest: booking.guests.join(", "),
      status: "confirmed",
    },
  });

  await logAudit(user.id, "booking.create", "Booking", booking.id, { unitId: booking.unitId, amount: booking.amount });
  return NextResponse.json(booking, { status: 201 });
}
