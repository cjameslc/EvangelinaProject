import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getMyActiveHousekeepingCredential } from "@/lib/access/service";

// The one credential-reveal path open to HOUSEKEEPING itself — narrower
// than the general staff reveal (canRevealAccessCredential explicitly
// excludes this role): a cleaner can only ever look up the code already
// assigned to their own Employee record for a given unit, nothing else.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const unitId = req.nextUrl.searchParams.get("unitId");
  if (!unitId) return NextResponse.json({ error: "unitId is required." }, { status: 400 });

  const employee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true } });
  if (!employee) return NextResponse.json({ code: null, validUntil: null, status: "none" });

  const credential = await getMyActiveHousekeepingCredential(employee.id, unitId);
  if (credential?.status === "active") {
    return NextResponse.json({ code: credential.code, validUntil: credential.validUntil, status: "active" });
  }
  if (credential?.status === "failed") {
    return NextResponse.json({ code: null, validUntil: null, status: "failed", reason: credential.reason });
  }
  return NextResponse.json({ code: null, validUntil: null, status: "none" });
}
