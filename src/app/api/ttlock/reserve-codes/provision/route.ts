import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, logAudit } from "@/lib/session";
import { provisionReserveCodesForUnit } from "@/lib/ttlock/reliability";

const bodySchema = z.object({ unitId: z.string().min(1) });

// One-time, admin-triggered provisioning of the 10-permanent-code emergency
// pool for a unit — deliberately not a cron/background job (see the spec
// this implements: reserve codes are a fixed inventory, never generated
// dynamically). Tops up to 10 if some already exist; no-ops if already at 10.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const { unitId } = bodySchema.parse(await req.json());

  let result;
  try {
    result = await provisionReserveCodesForUnit(unitId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Provisioning failed" }, { status: 502 });
  }

  await logAudit(user.id, "unit.ttlock_provision_reserve_codes", "Unit", unitId, result);
  return NextResponse.json(result);
}
