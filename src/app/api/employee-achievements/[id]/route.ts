import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { employeeAchievementSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;

  let body;
  try {
    body = employeeAchievementSchema.omit({ employeeId: true }).partial().parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = body.label;
  if (body.threshold !== undefined) data.threshold = body.threshold;
  if (body.rewardAmount !== undefined) data.rewardAmount = body.rewardAmount;
  if (body.personalMessage !== undefined) data.personalMessage = body.personalMessage || null;

  const achievement = await prisma.employeeAchievement.update({ where: { id: params.id }, data });
  await logAudit(user.id, "employeeAchievement.update", "EmployeeAchievement", achievement.id, body);
  return NextResponse.json(achievement);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN", "CO_OWNER"]);
  if (error) return error;

  await prisma.employeeAchievement.delete({ where: { id: params.id } });
  await logAudit(user.id, "employeeAchievement.delete", "EmployeeAchievement", params.id);
  return NextResponse.json({ ok: true });
}
