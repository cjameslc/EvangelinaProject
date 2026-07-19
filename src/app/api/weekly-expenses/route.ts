import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { weeklyExpenseSchema } from "@/lib/validation";

// Standing weekly salary deductions — auto-logged once per calendar week so
// they don't have to be re-entered by hand, but each generated row is a
// normal WeeklyExpense afterward: fully editable or removable for that week
// without affecting future weeks.
const RECURRING_SALARIES = [
  { employeeName: "Riemar Ligad", amount: 1000 },
  { employeeName: "Jayjay", amount: 4900 },
];

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function ensureRecurringSalaries() {
  const weekStart = new Date(dayOf(new Date()));
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  for (const rule of RECURRING_SALARIES) {
    const employee = await prisma.employee.findFirst({ where: { name: rule.employeeName, active: true } });
    if (!employee) continue;
    const existing = await prisma.weeklyExpense.findFirst({
      where: { targetEmployeeId: employee.id, note: "Salary", date: { gte: weekStart, lt: weekEnd } },
    });
    if (!existing) {
      await prisma.weeklyExpense.create({ data: { date: weekStart, amount: rule.amount, note: "Salary", targetEmployeeId: employee.id } });
    }
  }
}

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;

  await ensureRecurringSalaries();

  const expenses = await prisma.weeklyExpense.findMany({
    orderBy: { date: "desc" },
    take: 300,
    include: {
      targetEmployee: { select: { id: true, name: true, role: true } },
      addedBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  let body;
  try {
    body = weeklyExpenseSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  // A TikTok Ads entry is an operational expense, never a payroll
  // adjustment — force it untargeted regardless of what the client sent.
  const category = body.category ?? "GENERAL";
  const targetEmployeeId = category === "TIKTOK_ADS" ? null : body.targetEmployeeId || null;

  const expense = await prisma.weeklyExpense.create({
    data: {
      date: new Date(body.date),
      amount: body.amount,
      note: body.note,
      targetEmployeeId,
      category,
      addedById: user.id,
    },
    include: {
      targetEmployee: { select: { id: true, name: true, role: true } },
      addedBy: { select: { id: true, name: true } },
    },
  });
  const action = category === "TIKTOK_ADS" ? "expense.tiktok_ads.create" : "expense.create";
  await logAudit(user.id, action, "WeeklyExpense", expense.id, { amount: expense.amount, note: expense.note, category });
  return NextResponse.json(expense, { status: 201 });
}
