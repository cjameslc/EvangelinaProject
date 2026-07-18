import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { billUpdateSchema } from "@/lib/validation";
import { canEditHousekeeping } from "@/lib/rbac";

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
  return NextResponse.json(bill);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  await prisma.bill.delete({ where: { id: params.id } });
  await logAudit(user.id, "bill.delete", "Bill", params.id);
  return NextResponse.json({ ok: true });
}
