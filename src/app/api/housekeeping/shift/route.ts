import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { notifyStaff } from "@/lib/bookingEngine/notificationService";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const shift = await prisma.shift.findFirst({
    where: { userId: user.id, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  return NextResponse.json(shift);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const open = await prisma.shift.findFirst({ where: { userId: user.id, clockOut: null } });
  if (open) return NextResponse.json(open);
  const shift = await prisma.shift.create({ data: { userId: user.id, clockIn: new Date() } });
  await logAudit(user.id, "shift.clockin", "Shift", shift.id);
  return NextResponse.json(shift, { status: 201 });
}

const VALID_LOGOUT_REASONS = ["Scheduled Logout", "Manual Logout", "Session Expired", "Admin Logout"];

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  const open = await prisma.shift.findFirst({ where: { userId: user.id, clockOut: null }, orderBy: { clockIn: "desc" } });
  if (!open) return new Response("No open shift", { status: 400 });

  const body = await req.json().catch(() => ({}));
  // Spec section 1 — every logout is categorized. Defaults to "Manual
  // Logout" (the pre-existing behavior, unchanged) for any caller that
  // doesn't pass a reason.
  const logoutReason = VALID_LOGOUT_REASONS.includes(body.reason) ? body.reason : "Manual Logout";

  const shift = await prisma.shift.update({ where: { id: open.id }, data: { clockOut: new Date(), logoutReason } });
  await logAudit(user.id, "shift.clockout", "Shift", shift.id, { reason: logoutReason });
  if (logoutReason === "Scheduled Logout") {
    await notifyStaff({ type: "employee.autologout", employeeName: user.name ?? "A housekeeper" });
  }
  return NextResponse.json(shift);
}
