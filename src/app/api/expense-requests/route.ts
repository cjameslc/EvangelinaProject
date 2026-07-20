import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { expenseRequestSchema } from "@/lib/validation";
import { isPayrollRole } from "@/lib/payroll";

const REQUEST_INCLUDE = {
  employee: { select: { id: true, name: true, role: true } },
  unit: { select: { id: true, name: true, shortName: true } },
  reviewedBy: { select: { id: true, name: true } },
};

// Owner/Admin see every request (optionally filtered to a status, e.g. the
// approval queue's ?status=PENDING); anyone else sees only their own —
// enforced here, not just hidden in the UI, same pattern as /api/my-earnings.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const isAdminViewer = user.role === "OWNER_ADMIN" || user.role === "CO_OWNER";
  const statusFilter = req.nextUrl.searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (statusFilter) where.status = statusFilter;

  if (!isAdminViewer) {
    const own = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!own) return NextResponse.json([]);
    where.employeeId = own.id;
  }

  const requests = await prisma.expenseRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: REQUEST_INCLUDE });
  return NextResponse.json(requests);
}

// Any payroll-eligible employee (Booker/Housekeeping/Auditor) can submit a
// request for themselves. Owner/Admin/Co-owner are excluded — they don't
// have a payroll-eligible Employee role to submit under, and can already
// see (and approve/reject) every request from Owner Summary's Expense
// approvals queue.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const own = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true, role: true } });
  if (!own || !isPayrollRole(own.role)) {
    return NextResponse.json({ error: "Only staff with a payroll record can submit an expense request." }, { status: 403 });
  }

  let body;
  try {
    body = expenseRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  // Every manually-typed note gets its first letter capitalized here —
  // server-side, not just in the submit form — so it's consistent no matter
  // what actually calls this endpoint.
  const note = body.note.trim();
  const request = await prisma.expenseRequest.create({
    data: {
      employeeId: own.id,
      category: body.category,
      unitId: body.category === "UNIT_EXPENSE" ? body.unitId : null,
      amount: body.amount,
      note: note ? note.charAt(0).toUpperCase() + note.slice(1) : note,
      receiptUrl: body.receiptUrl || null,
      date: new Date(body.date),
    },
    include: REQUEST_INCLUDE,
  });
  await logAudit(user.id, "expenseRequest.submit", "ExpenseRequest", request.id, { category: body.category, amount: body.amount });
  return NextResponse.json(request, { status: 201 });
}
