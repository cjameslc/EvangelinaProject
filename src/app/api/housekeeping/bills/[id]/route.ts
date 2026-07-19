import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { billUpdateSchema } from "@/lib/validation";
import { canEditHousekeeping } from "@/lib/rbac";

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
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

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
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  await prisma.bill.delete({ where: { id: params.id } });
  await logAudit(user.id, "bill.delete", "Bill", params.id);
  revalidateBillDependentPages();
  return NextResponse.json({ ok: true });
}
