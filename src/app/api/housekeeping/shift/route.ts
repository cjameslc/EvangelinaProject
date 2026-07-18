import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const shift = await prisma.shift.findFirst({
    where: { userId: user.id, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  return NextResponse.json(shift);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const open = await prisma.shift.findFirst({ where: { userId: user.id, clockOut: null } });
  if (open) return NextResponse.json(open);
  const shift = await prisma.shift.create({ data: { userId: user.id, clockIn: new Date() } });
  await logAudit(user.id, "shift.clockin", "Shift", shift.id);
  return NextResponse.json(shift, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const open = await prisma.shift.findFirst({ where: { userId: user.id, clockOut: null }, orderBy: { clockIn: "desc" } });
  if (!open) return new Response("No open shift", { status: 400 });
  const shift = await prisma.shift.update({ where: { id: open.id }, data: { clockOut: new Date() } });
  await logAudit(user.id, "shift.clockout", "Shift", shift.id);
  return NextResponse.json(shift);
}
