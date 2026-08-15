import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { billUpdateSchema } from "@/lib/validation";
import { hasActionAccess } from "@/lib/actionAccess";

// A bill's paid status feeds Net Profit/Margin/Cash Flow on the Dashboard
// and the Bills tab on Admin, both server-rendered — without this, marking
// something paid here only updates the DB and this page's own local state;
// Dashboard/Admin would keep showing the pre-payment figures until a hard
// reload, since Next's router cache doesn't know this data changed.
function revalidateBillDependentPages() {
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath("/housekeeping");
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

  // Real Bill.ownerId now covers the tenant boundary directly, including a
  // site-wide bill (unitId null, e.g. shared Internet) — previously that
  // case had no protection at all since isUnitInScope has nothing to check
  // without a unit. isUnitInScope is still checked afterward for a unit-tied
  // bill, since that's a separate, finer concern (a Co-owner's own unit
  // subset within their own tenant), not the tenant boundary itself.
  const existing = await prisma.bill.findUnique({ where: { id: params.id }, select: { unitId: true, ownerId: true } });
  if (!existing || existing.ownerId !== user.ownerId) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  if (existing.unitId && !await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);

  let body;
  try {
    body = billUpdateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const data: any = { ...body };
  if (body.paid) data.paidAt = new Date();
  if (body.paid === false) data.paidAt = null;

  const bill = await prisma.bill.update({ where: { id: params.id }, data });
  await logAudit(user.id, "bill.update", "Bill", bill.id, body);
  revalidateBillDependentPages();
  return NextResponse.json(bill);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

  const existing = await prisma.bill.findUnique({ where: { id: params.id }, select: { unitId: true, ownerId: true } });
  if (!existing || existing.ownerId !== user.ownerId) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  if (existing.unitId && !await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);

  await prisma.bill.delete({ where: { id: params.id } });
  await logAudit(user.id, "bill.delete", "Bill", params.id);
  revalidateBillDependentPages();
  return NextResponse.json({ ok: true });
}
