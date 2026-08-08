import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canGrantHousekeepingAccess } from "@/lib/rbac";
import { createHousekeepingCredential } from "@/lib/access/service";
import { notifyStaff } from "@/lib/bookingEngine/notificationService";

// Owner/Booker-only — spec section 6/7. Housekeeping/Maintenance/Inspector/
// Guest are all excluded by canGrantHousekeepingAccess itself.
export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canGrantHousekeepingAccess(user.role)) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const unitId = typeof body.unitId === "string" ? body.unitId : null;
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : null;
  if (!unitId || !employeeId) return NextResponse.json({ error: "unitId and employeeId are required." }, { status: 400 });
  if (!await isUnitInScope(user, unitId)) return NextResponse.json({ error: "Unit not found." }, { status: 404 });

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true, role: true, active: true } });
  if (!employee || !employee.active || employee.role !== "HOUSEKEEPING") {
    return NextResponse.json({ error: "That employee isn't an active Housekeeping staff member." }, { status: 400 });
  }

  try {
    const credential = await createHousekeepingCredential({ unitId, assignedEmployeeId: employeeId, actorUserId: user.id });
    const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { shortName: true } });
    await notifyStaff({ type: "code.generated", unitId, unitName: unit?.shortName ?? "unit", employeeName: employee.name });
    return NextResponse.json(credential);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate access code." }, { status: 400 });
  }
}
