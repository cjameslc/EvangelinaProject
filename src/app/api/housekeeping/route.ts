import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere } from "@/lib/session";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const [states, logs] = await Promise.all([
    prisma.housekeepingUnitState.findMany({
      where: unitWhere(user),
      include: { unit: true },
    }),
    prisma.cleaningLog.findMany({
      where: unitWhere(user),
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { unit: { select: { name: true, shortName: true } }, employee: { select: { name: true } } },
    }),
  ]);
  return NextResponse.json({ states, logs });
}
