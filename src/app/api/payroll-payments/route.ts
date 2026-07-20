import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { payrollPaymentSchema } from "@/lib/validation";
import { manilaWeekRange } from "@/lib/format";

// Record-keeping only — see the model comment in schema.prisma. Owner/
// Admin/Co-owner can view; only Owner/Admin can mark a status change,
// matching the existing gate on approving an expense request.
export async function GET(req: NextRequest) {
  const { error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;

  const periodStartParam = req.nextUrl.searchParams.get("periodStart");
  const periodStart = periodStartParam ? new Date(periodStartParam) : manilaWeekRange(0).start;

  const payments = await prisma.payrollPayment.findMany({
    where: { periodStart },
    include: { markedBy: { select: { id: true, name: true } } },
  });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  let body;
  try {
    body = payrollPaymentSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const periodStart = new Date(body.periodStart);
  const payment = await prisma.payrollPayment.upsert({
    where: { employeeId_periodStart: { employeeId: body.employeeId, periodStart } },
    create: {
      employeeId: body.employeeId,
      periodStart,
      amount: body.amount,
      status: body.status,
      givenAt: body.status === "GIVEN" ? new Date() : null,
      markedById: user.id,
    },
    update: {
      amount: body.amount,
      status: body.status,
      givenAt: body.status === "GIVEN" ? new Date() : null,
      markedById: user.id,
    },
    include: { markedBy: { select: { id: true, name: true } } },
  });
  await logAudit(user.id, body.status === "GIVEN" ? "payroll.mark_given" : "payroll.mark_pending", "PayrollPayment", payment.id, { employeeId: body.employeeId, amount: body.amount });
  return NextResponse.json(payment);
}
