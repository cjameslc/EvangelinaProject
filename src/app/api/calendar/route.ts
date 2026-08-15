import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { calendarBlockSchema } from "@/lib/validation";
import { canEditBookings } from "@/lib/rbac";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const blocks = await prisma.calendarBlock.findMany({
    where: unitWhere(user),
    orderBy: { date: "asc" },
    include: {
      unit: { select: { id: true, name: true, unitNumber: true, shortName: true } },
      booking: {
        select: {
          id: true, confirmationNumber: true,
          platform: true, amount: true, paid: true, dpAmount: true,
          checkInTime: true, checkOutTime: true, pax: true, contactNumber: true,
          method: true, dpMethod: true,
          booker: { select: { name: true } },
          cleaner: { select: { name: true } },
        },
      },
    },
  });
  return NextResponse.json(blocks);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const body = calendarBlockSchema.parse(await req.json());
  if (!await isUnitInScope(user, body.unitId)) return forbiddenUnitScopeResponse(user);

  const block = await prisma.calendarBlock.create({
    data: {
      unitId: body.unitId,
      type: body.type,
      date: new Date(body.date),
      endDate: body.endDate ? new Date(body.endDate) : null,
      guest: body.guest || null,
      note: body.note || null,
      status: "confirmed",
    },
  });
  await logAudit(user.id, "calendar.create", "CalendarBlock", block.id);
  return NextResponse.json(block, { status: 201 });
}
