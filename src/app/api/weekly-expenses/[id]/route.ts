import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { weeklyExpenseSchema } from "@/lib/validation";

// PATCH deliberately doesn't log an audit entry — weekly expenses get
// corrected often (typos, amount tweaks) and each edit was drowning the
// activity trail in "expense.update" noise. Only creation and deletion of
// an expense are audited.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  let body;
  try {
    body = weeklyExpenseSchema.partial().parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.date) data.date = new Date(body.date);
  if (body.amount) data.amount = body.amount;
  if (body.note) data.note = body.note;
  if (body.targetEmployeeId !== undefined) data.targetEmployeeId = body.targetEmployeeId || null;

  const expense = await prisma.weeklyExpense.update({
    where: { id: params.id },
    data,
    include: { targetEmployee: { select: { id: true, name: true, role: true } } },
  });
  return NextResponse.json(expense);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  await prisma.weeklyExpense.delete({ where: { id: params.id } });
  await logAudit(user.id, "expense.delete", "WeeklyExpense", params.id);
  return NextResponse.json({ ok: true });
}
