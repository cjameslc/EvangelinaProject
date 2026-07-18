import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { employeeSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;
  const body = employeeSchema.partial().parse(await req.json());
  const employee = await prisma.employee.update({ where: { id: params.id }, data: body });
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
