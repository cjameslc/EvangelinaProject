import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { employeeSchema } from "@/lib/validation";
import { monthlySalaryFromRate } from "@/lib/payroll";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  const employees = await prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;
  const body = employeeSchema.parse(await req.json());
  // salaryType/salaryRate (what Admin actually edits) is the source of truth
  // for monthlySalary whenever both are given — recomputed here rather than
  // trusted from the client.
  const data = { ...body };
  if (body.salaryType && body.salaryRate != null) {
    data.monthlySalary = monthlySalaryFromRate(body.salaryType, body.salaryRate);
  }
  const employee = await prisma.employee.create({ data });
  if (data.monthlySalary) {
    await prisma.salaryHistory.create({ data: { employeeId: employee.id, monthlySalary: data.monthlySalary } });
  }
  await logAudit(user.id, "employee.create", "Employee", employee.id, { name: employee.name });
  return NextResponse.json(employee, { status: 201 });
}
