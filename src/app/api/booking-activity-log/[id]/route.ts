import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope, logAudit } from "@/lib/session";
import { canDeleteBookings } from "@/lib/rbac";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canDeleteBookings(user.role as any)) {
    return NextResponse.json({ error: "You don't have access to delete a logged transaction." }, { status: 403 });
  }

  const entry = await prisma.bookingActivityLog.findUnique({ where: { id: params.id }, select: { id: true, unitId: true } });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (entry.unitId && !isUnitInScope(user, entry.unitId)) {
    return NextResponse.json({ error: "You don't have access to that unit." }, { status: 403 });
  }

  await prisma.bookingActivityLog.delete({ where: { id: params.id } });
  await logAudit(user.id, "bookingActivityLog.delete", "BookingActivityLog", params.id, {});
  return NextResponse.json({ ok: true });
}
