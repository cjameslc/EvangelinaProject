import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { employeeSchema } from "@/lib/validation";
import { monthlySalaryFromRate } from "@/lib/payroll";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  // Was missing — same audit sweep as Units/Users/employees/[id]; without
  // this every authenticated staff member (any role) saw every tenant's
  // employee directory, including salary rate and pay-rate notes.
  // user.avatarUrl/avatarColor included so pickers that show a face per
  // employee (e.g. the Sales Championship's participant/side config panel)
  // don't need a second round-trip — additive, existing consumers that
  // only read the flat Employee fields are unaffected.
  const employees = await prisma.employee.findMany({
    where: { active: true, ownerId: user.ownerId },
    orderBy: { name: "asc" },
    include: { user: { select: { avatarUrl: true, avatarColor: true } } },
  });
  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;
  const body = employeeSchema.parse(await req.json());
  // salaryType/salaryRate (what Admin actually edits) is the source of truth
  // for monthlySalary whenever both are given — recomputed here rather than
  // trusted from the client.
  // ownerId: user.ownerId — was missing, so every employee created via
  // this route was written tenant-less (invisible to every owner-scoped
  // query, including this route's own GET above).
  const data = { ...body, ownerId: user.ownerId };
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
