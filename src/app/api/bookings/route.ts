import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere } from "@/lib/session";
import { bookingSchema } from "@/lib/validation";
import { canEditBookings } from "@/lib/rbac";
import { createBookingRecord } from "@/lib/bookingService";

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
  // Mirror BookingForm.tsx's own lock server-side: whoever is logged in and
  // has their own Employee record is the booker on a manually-created
  // booking, full stop — the client-submitted bookerId is never trusted for
  // this endpoint, since BOOKER and HOUSEKEEPING both earn a real ₱100
  // commission + Elite Challenge credit off whoever bookerId names. Only
  // applies here (the "New booking" form's create path) — the Excel/CSV
  // importer calls createBookingRecord directly with a bookerId resolved
  // per-row from the sheet's own "Booker Name" column and must keep doing
  // that, since a bulk import's rows can each have a different real booker.
  const ownEmployee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (ownEmployee) body.bookerId = ownEmployee.id;

  const result = await createBookingRecord(user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result.booking, { status: 201 });
}
