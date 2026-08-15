import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere, unitIdWhere, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { hasActionAccess } from "@/lib/actionAccess";
import { billCreateSchema } from "@/lib/validation";
import { ensureRecurringBillsForMonth } from "@/lib/recurringExpenses";

// GET ?month=2026-07 — ensures every active RecurringExpenseTemplate has its
// Bill for the requested month (see ensureRecurringBillsForMonth), then
// returns all of that month's bills (template-generated plus any one-off
// custom bills logged by hand).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const monthParam = req.nextUrl.searchParams.get("month");
  const now = monthParam ? new Date(monthParam + "-01T00:00:00.000Z") : new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  await ensureRecurringBillsForMonth(month, user.ownerId);

  // Carry forward any custom (hand-entered, non-template) bill marked
  // "recurring" from the previous month, so e.g. a one-off monthly charge
  // that isn't part of the template system doesn't need re-entering by hand.
  const units = await prisma.unit.findMany({ where: unitIdWhere(user), select: { id: true } });
  const prevMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
  const recurringLastMonth = await prisma.bill.findMany({
    where: { unitId: { in: units.map((u) => u.id) }, key: "custom", recurring: true, month: prevMonth },
  });
  if (recurringLastMonth.length > 0) {
    // Same "batch the existence check, then batch the writes" shape as
    // ensureRecurringBillsForMonth — one findMany + one createMany instead
    // of a findFirst+create pair per carried-forward bill.
    const thisMonthCustom = await prisma.bill.findMany({
      where: { unitId: { in: recurringLastMonth.map((b) => b.unitId).filter((id): id is string => id != null) }, key: "custom", month },
      select: { unitId: true, label: true },
    });
    const existingKeys = new Set(thisMonthCustom.map((b) => `${b.unitId}::${b.label}`));
    const missing = recurringLastMonth.filter((prev) => !existingKeys.has(`${prev.unitId}::${prev.label}`));
    if (missing.length > 0) {
      await prisma.bill.createMany({
        data: missing.map((prev) => ({
          ownerId: prev.ownerId,
          unitId: prev.unitId,
          key: "custom" as const,
          label: prev.label,
          month,
          amountDue: prev.amountDue,
          dueDay: prev.dueDay,
          recurring: true,
        })),
      });
    }
  }

  const bills = await prisma.bill.findMany({
    where: { ...unitWhere(user), ownerId: user.ownerId, month },
    include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } },
  });
  return NextResponse.json(bills);
}

// Adds a one-off custom bill (e.g. "Cable TV", "Pest control") beyond the
// 5 built-in monthly types.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

  let body;
  try {
    body = billCreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }
  if (!await isUnitInScope(user, body.unitId)) return forbiddenUnitScopeResponse(user);

  const month = new Date(body.month + "-01T00:00:00.000Z");
  const bill = await prisma.bill.create({
    data: {
      ownerId: user.ownerId,
      unitId: body.unitId,
      key: "custom",
      label: body.label,
      month,
      amountDue: body.amountDue,
      dueDay: body.dueDay ?? null,
      recurring: body.recurring ?? false,
    },
    include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } },
  });
  await logAudit(user.id, "bill.create", "Bill", bill.id, { unitId: body.unitId, label: body.label, amountDue: body.amountDue, recurring: body.recurring });
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath("/housekeeping");
  return NextResponse.json(bill, { status: 201 });
}
