import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";

// Closes the maintenance loop on a low/critical-battery alert — staff swap
// the physical battery, then mark it here so the alert clears and the
// "Last Battery Replacement" date shown on the unit card is accurate.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!await isUnitInScope(user, params.id)) return forbiddenUnitScopeResponse(user);

  const unit = await prisma.unit.update({
    where: { id: params.id },
    data: { ttlockBatteryReplacedAt: new Date() },
  });
  await logAudit(user.id, "unit.battery_replaced", "Unit", unit.id);
  return NextResponse.json(unit);
}
