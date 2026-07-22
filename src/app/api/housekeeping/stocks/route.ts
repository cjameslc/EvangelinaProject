import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere, logAudit } from "@/lib/session";
import { canAddHousekeepingStock } from "@/lib/rbac";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const stocks = await prisma.stock.findMany({ where: unitWhere(user), orderBy: { name: "asc" } });
  return NextResponse.json(stocks);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canAddHousekeepingStock(user.role as any)) return new Response("Forbidden", { status: 403 });
  const { unitId, name, count } = await req.json();
  const stock = await prisma.stock.create({ data: { unitId, name, count: count ?? 0 } });
  await logAudit(user.id, "stock.create", "Stock", stock.id, { name });
  return NextResponse.json(stock, { status: 201 });
}
