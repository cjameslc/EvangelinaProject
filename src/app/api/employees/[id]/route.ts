import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { employeeSchema } from "@/lib/validation";
import { monthlySalaryFromRate } from "@/lib/payroll";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;
  const body = employeeSchema.partial().parse(await req.json());

  const existing = await prisma.employee.findUnique({ where: { id: params.id }, select: { monthlySalary: true, salaryType: true, salaryRate: true } });
  const data = { ...body };
  if (body.salaryType && body.salaryRate != null) {
    data.monthlySalary = monthlySalaryFromRate(body.salaryType, body.salaryRate);
  } else if (body.salaryRate != null && existing) {
    // Rate changed but type wasn't resent — recompute against the existing type.
    data.monthlySalary = monthlySalaryFromRate(body.salaryType ?? existing.salaryType as any, body.salaryRate);
  }
  const salaryChanged = data.monthlySalary !== undefined && data.monthlySalary !== existing?.monthlySalary;

  const employee = await prisma.employee.update({ where: { id: params.id }, data });
  // Append-only: past reports keep reading whatever rate was effective at
  // their own period, not this new one.
  if (salaryChanged) {
    await prisma.salaryHistory.create({ data: { employeeId: employee.id, monthlySalary: data.monthlySalary! } });
  }
  await logAudit(user.id, "employee.update", "Employee", employee.id, body);
  return NextResponse.json(employee);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;
  await prisma.employee.update({ where: { id: params.id }, data: { active: false } });
  await logAudit(user.id, "employee.deactivate", "Employee", params.id);
  return NextResponse.json({ ok: true });
}
