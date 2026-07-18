import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { bookingSchema } from "@/lib/validation";
import { canEditBookings } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const body = bookingSchema.partial().parse(await req.json());
  const data: any = { ...body };
  if (body.date) data.date = new Date(body.date);
  if (body.checkOutDate !== undefined) data.checkOutDate = body.checkOutDate ? new Date(body.checkOutDate) : null;

  const booking = await prisma.booking.update({ where: { id: params.id }, data });
  await logAudit(user.id, "booking.update", "Booking", booking.id, body);
  return NextResponse.json(booking);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  await prisma.booking.delete({ where: { id: params.id } });
  await logAudit(user.id, "booking.delete", "Booking", params.id);
  return NextResponse.json({ ok: true });
}
