import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, unitIdWhere, logAudit } from "@/lib/session";
import { ownerUnitWhere } from "@/lib/ownerScope";
import { unitSchema } from "@/lib/validation";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  // Reference implementation of owner-scoping (see src/lib/ownerScope.ts) —
  // for Evangelina's own staff this is a no-op (every existing unit was
  // backfilled to Evangelina's Owner row, so the filter matches every row
  // it always did), but it's what actually stops one owner's staff from
  // ever seeing another owner's units at the query level once a second
  // owner exists.
  const units = await prisma.unit.findMany({
    where: { ...unitIdWhere(user), ...ownerUnitWhere(user) },
    orderBy: { sortOrder: "asc" },
    include: { owners: { include: { user: { select: { id: true, name: true } } } } },
  });
  return NextResponse.json(units);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const { ownerUserIds, icalImportUrl, ...body } = unitSchema.parse(await req.json());
  // 256-bit (32-byte) token — generated exactly once, here, and never
  // touched again by a normal update (see PATCH below); only the explicit
  // "Regenerate link" action replaces it.
  const unit = await prisma.unit.create({
    data: { ...body, icalImportUrl: icalImportUrl || null, icalToken: crypto.randomBytes(32).toString("hex") },
  });
  if (ownerUserIds?.length) {
    await prisma.unitOwner.createMany({ data: ownerUserIds.map((userId) => ({ userId, unitId: unit.id })) });
  }
  await prisma.stock.createMany({
    data: [
      ["Tissue rolls", 4], ["Bath towels", 6], ["Bottled water", 8],
      ["Toiletry kits", 5], ["Trash bags", 10], ["Coffee/creamer sachets", 12],
    ].map(([name, count]) => ({ unitId: unit.id, name: name as string, count: count as number })),
  });
  await prisma.housekeepingUnitState.create({ data: { unitId: unit.id, checked: [] as any } });
  await logAudit(user.id, "unit.create", "Unit", unit.id, { name: unit.name });
  return NextResponse.json(unit, { status: 201 });
}
