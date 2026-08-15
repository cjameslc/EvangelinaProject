import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { weeklyExpenseSchema } from "@/lib/validation";

// PATCH deliberately doesn't log an audit entry — weekly expenses get
// corrected often (typos, amount tweaks) and each edit was drowning the
// activity trail in "expense.update" noise. Only creation and deletion of
// an expense are audited.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  let body;
  try {
    body = weeklyExpenseSchema.partial().parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  // Was missing — same audit sweep as Units/Users/Employees.
  const existing = await prisma.weeklyExpense.findUnique({ where: { id: params.id }, select: { category: true, ownerId: true } });
  if (!existing || existing.ownerId !== user.ownerId) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  const nextCategory = body.category ?? existing?.category ?? "GENERAL";

  const data: Record<string, unknown> = {};
  if (body.date) data.date = new Date(body.date);
  if (body.amount) data.amount = body.amount;
  if (body.note) data.note = body.note;
  if (body.category) data.category = body.category;
  // A TikTok Ads entry stays untargeted even if the request tries to set
  // one — same rule as creation.
  if (body.targetEmployeeId !== undefined) data.targetEmployeeId = nextCategory === "TIKTOK_ADS" ? null : body.targetEmployeeId || null;

  const expense = await prisma.weeklyExpense.update({
    where: { id: params.id },
    data,
    include: {
      targetEmployee: { select: { id: true, name: true, role: true } },
      addedBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(expense);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  const existing = await prisma.weeklyExpense.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!existing || existing.ownerId !== user.ownerId) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  const deleted = await prisma.weeklyExpense.delete({ where: { id: params.id } });
  await logAudit(user.id, "expense.delete", "WeeklyExpense", params.id, { before: deleted });
  return NextResponse.json({ ok: true });
}
