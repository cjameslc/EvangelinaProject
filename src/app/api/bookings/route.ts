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
  const result = await createBookingRecord(user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result.booking, { status: 201 });
}
