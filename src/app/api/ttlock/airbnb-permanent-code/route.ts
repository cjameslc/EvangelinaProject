import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { setAirbnbPermanentCode } from "@/lib/access/service";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ unitId: z.string().min(1), code: z.string().regex(/^\d{4,8}$/, "Code must be 4-8 digits") });

// Admin-triggered set/rotate of a unit's single fixed, non-expiring
// Airbnb code — every Airbnb guest of that unit shares this one code
// forever, until an admin explicitly calls this again with a different
// code. Never called automatically by any booking flow (see
// createGuestAccessCode's Airbnb guard in access/service.ts).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const { unitId, code } = bodySchema.parse(await req.json());
  // Without this, any Owner/Admin could pass another tenant's unitId and
  // set a real permanent unlock code onto that tenant's physical lock — a
  // physical-security compromise, not just a data leak.
  if (!await isUnitInScope(user, unitId)) return forbiddenUnitScopeResponse(user);

  let result;
  try {
    result = await setAirbnbPermanentCode({ unitId, code, actorUserId: user.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Setting the code failed" }, { status: 502 });
  }

  await logAudit(user.id, "unit.ttlock_set_airbnb_permanent_code", "Unit", unitId, { credentialId: result.id, source: result.source });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const unitId = req.nextUrl.searchParams.get("unitId");
  if (!unitId) return NextResponse.json({ error: "unitId is required." }, { status: 400 });
  if (!await isUnitInScope(user, unitId)) return forbiddenUnitScopeResponse(user);

  const credential = await prisma.accessCredential.findFirst({
    where: { unitId, type: "AIRBNB_PERMANENT", status: "ACTIVE" },
    select: { id: true, code: true, source: true, createdAt: true },
  });
  return NextResponse.json({ credential });
}
