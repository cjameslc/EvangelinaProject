import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { employeeAchievementSchema } from "@/lib/validation";

// Non-admins may only ever list their own — enforced here, not just hidden
// in the UI, same pattern as /api/my-earnings.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const isAdminViewer = user.role === "OWNER_ADMIN" || user.role === "CO_OWNER";
  const requestedEmployeeId = req.nextUrl.searchParams.get("employeeId");

  let employeeId = requestedEmployeeId;
  if (!isAdminViewer) {
    const own = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true } });
    if (!own || (requestedEmployeeId && requestedEmployeeId !== own.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    employeeId = own.id;
  } else if (requestedEmployeeId) {
    // Was missing — an Owner/Admin could pass another tenant's employeeId
    // and read/create achievement records against it, same class of bug
    // already fixed on the [id] sibling route.
    const target = await prisma.employee.findUnique({ where: { id: requestedEmployeeId }, select: { ownerId: true } });
    if (!target || target.ownerId !== user.ownerId) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

  const achievements = await prisma.employeeAchievement.findMany({ where: { employeeId }, orderBy: { threshold: "asc" } });
  return NextResponse.json(achievements);
}

// Owner/Admin/Co-owner only — matches who can already edit an employee's
// salary (the other thing configured from the Owner Summary view).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;

  let body;
  try {
    body = employeeAchievementSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  // Was missing — same fix as GET above.
  const targetEmployee = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { ownerId: true } });
  if (!targetEmployee || targetEmployee.ownerId !== user.ownerId) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const achievement = await prisma.employeeAchievement.create({
    data: {
      employeeId: body.employeeId,
      label: body.label,
      threshold: body.threshold,
      rewardAmount: body.rewardAmount ?? 0,
      personalMessage: body.personalMessage || null,
    },
  });
  await logAudit(user.id, "employeeAchievement.create", "EmployeeAchievement", achievement.id, { employeeId: body.employeeId, label: body.label });
  return NextResponse.json(achievement, { status: 201 });
}
