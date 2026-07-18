import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere, unitIdWhere, logAudit } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";
import { BILL_TYPES } from "@/lib/constants";
import { billCreateSchema } from "@/lib/validation";

const DEFAULT_DUE: Record<string, number> = { assoc: 3500, water: 1800, elec: 6200, net: 1799, stream: 549 };
const DEFAULT_DUE_DAY: Record<string, number> = { assoc: 15, water: 15, elec: 18, net: 20, stream: 25 };

// GET ?month=2026-07 — ensures a Bill row exists for every unit x bill-type
// for the requested month, then returns them (plus any custom bills logged).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const monthParam = req.nextUrl.searchParams.get("month");
  const now = monthParam ? new Date(monthParam + "-01T00:00:00.000Z") : new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const units = await prisma.unit.findMany({ where: unitIdWhere(user), select: { id: true } });

  for (const unit of units) {
    for (const bt of BILL_TYPES) {
      const existing = await prisma.bill.findFirst({ where: { unitId: unit.id, key: bt.key as any, month } });
      if (!existing) {
        await prisma.bill.create({ data: { unitId: unit.id, key: bt.key as any, month, amountDue: DEFAULT_DUE[bt.key] ?? 0, dueDay: DEFAULT_DUE_DAY[bt.key] ?? null } });
      } else if (existing.dueDay == null && DEFAULT_DUE_DAY[bt.key]) {
        // Backfill a sensible due day for bills that were auto-provisioned before dueDay existed.
        await prisma.bill.update({ where: { id: existing.id }, data: { dueDay: DEFAULT_DUE_DAY[bt.key] } });
      }
    }
  }

  const bills = await prisma.bill.findMany({
    where: { ...unitWhere(user), month },
    include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } },
  });
  return NextResponse.json(bills);
}

// Adds a one-off custom bill (e.g. "Cable TV", "Pest control") beyond the
// 5 built-in monthly types.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  let body;
  try {
    body = billCreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const month = new Date(body.month + "-01T00:00:00.000Z");
  const bill = await prisma.bill.create({
    data: { unitId: body.unitId, key: "custom", label: body.label, month, amountDue: body.amountDue },
    include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } },
  });
  await logAudit(user.id, "bill.create", "Bill", bill.id, { unitId: body.unitId, label: body.label, amountDue: body.amountDue });
  return NextResponse.json(bill, { status: 201 });
}
