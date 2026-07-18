import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });
  const { count } = await req.json();
  const stock = await prisma.stock.update({ where: { id: params.id }, data: { count: Math.max(0, count) } });
  return NextResponse.json(stock);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });
  await prisma.stock.delete({ where: { id: params.id } });
  await logAudit(user.id, "stock.delete", "Stock", params.id);
  return NextResponse.json({ ok: true });
}
