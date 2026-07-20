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
    const own = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!own || (requestedEmployeeId && requestedEmployeeId !== own.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    employeeId = own.id;
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
