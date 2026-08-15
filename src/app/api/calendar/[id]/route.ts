import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { calendarBlockSchema } from "@/lib/validation";
import { canEditBookings } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.calendarBlock.findUnique({ where: { id: params.id }, select: { unitId: true } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);

  const body = calendarBlockSchema.partial().parse(await req.json());
  if (body.unitId && !await isUnitInScope(user, body.unitId)) return forbiddenUnitScopeResponse(user);
  const data: any = { ...body };
  if (body.date) data.date = new Date(body.date);
  if (body.endDate) data.endDate = new Date(body.endDate);

  const block = await prisma.calendarBlock.update({ where: { id: params.id }, data });
  await logAudit(user.id, "calendar.update", "CalendarBlock", block.id);
  return NextResponse.json(block);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.calendarBlock.findUnique({ where: { id: params.id }, select: { unitId: true } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);

  await prisma.calendarBlock.delete({ where: { id: params.id } });
  await logAudit(user.id, "calendar.delete", "CalendarBlock", params.id);
  return NextResponse.json({ ok: true });
}
