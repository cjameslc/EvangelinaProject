import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitIdWhere, logAudit } from "@/lib/session";
import { unitSchema } from "@/lib/validation";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const units = await prisma.unit.findMany({
    where: unitIdWhere(user),
    orderBy: { sortOrder: "asc" },
    include: { owners: { include: { user: { select: { id: true, name: true } } } } },
  });
  return NextResponse.json(units);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const { ownerUserIds, ...body } = unitSchema.parse(await req.json());
  const unit = await prisma.unit.create({ data: body });
  if (ownerUserIds?.length) {
    await prisma.unitOwner.createMany({ data: ownerUserIds.map((userId) => ({ userId, unitId: unit.id })) });
  }
  await prisma.stock.createMany({
    data: [
      ["Tissue rolls", 4], ["Bath towels", 6], ["Bottled water", 8],
      ["Toiletry kits", 5], ["Trash bags", 10], ["Coffee/creamer sachets", 12],
    ].map(([name, count]) => ({ unitId: unit.id, name: name as string, count: count as number })),
  });
  await prisma.housekeepingUnitState.create({ data: { unitId: unit.id, checked: [] } });
  await logAudit(user.id, "unit.create", "Unit", unit.id, { name: unit.name });
  return NextResponse.json(unit, { status: 201 });
}
