import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { hasActionAccess } from "@/lib/actionAccess";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });
  // Was missing — same cross-tenant gap as Bills/Housekeeping-unit; Stock.unitId is required (never null), so this is a plain check.
  const existing = await prisma.stock.findUnique({ where: { id: params.id }, select: { unitId: true } });
  if (!existing) return NextResponse.json({ error: "Stock item not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);
  const { count } = await req.json();
  const stock = await prisma.stock.update({ where: { id: params.id }, data: { count: Math.max(0, count) } });
  return NextResponse.json(stock);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });
  const existing = await prisma.stock.findUnique({ where: { id: params.id }, select: { unitId: true } });
  if (!existing) return NextResponse.json({ error: "Stock item not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);
  await prisma.stock.delete({ where: { id: params.id } });
  await logAudit(user.id, "stock.delete", "Stock", params.id);
  return NextResponse.json({ ok: true });
}
