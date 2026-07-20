import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { expenseRequestReviewSchema } from "@/lib/validation";

const REQUEST_INCLUDE = {
  employee: { select: { id: true, name: true, role: true } },
  unit: { select: { id: true, name: true, shortName: true } },
  reviewedBy: { select: { id: true, name: true } },
};

// Approve or reject a submitted request. Owner/Admin only — matches the
// existing gate on directly logging a Weekly report expense; a rejected
// request is kept (with the reason) rather than deleted, so the employee
// can see why instead of it silently vanishing.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const existing = await prisma.expenseRequest.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (existing.status !== "PENDING") return NextResponse.json({ error: "This request was already reviewed." }, { status: 409 });

  let body;
  try {
    body = expenseRequestReviewSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }
  if (body.status === "REJECTED" && !body.rejectionReason?.trim()) {
    return NextResponse.json({ error: "Add a short reason for the employee." }, { status: 400 });
  }

  const request = await prisma.expenseRequest.update({
    where: { id: params.id },
    data: {
      status: body.status,
      rejectionReason: body.status === "REJECTED" ? body.rejectionReason!.trim() : null,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
    include: REQUEST_INCLUDE,
  });
  await logAudit(user.id, body.status === "APPROVED" ? "expenseRequest.approve" : "expenseRequest.reject", "ExpenseRequest", request.id);
  return NextResponse.json(request);
}

// Cancel — only the submitting employee, and only while still PENDING (once
// reviewed, the record stays as the audit trail; use PATCH to change it).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const existing = await prisma.expenseRequest.findUnique({ where: { id: params.id }, include: { employee: { select: { userId: true } } } });
  if (!existing) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (existing.employee.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (existing.status !== "PENDING") return NextResponse.json({ error: "Only a pending request can be cancelled." }, { status: 409 });

  await prisma.expenseRequest.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
