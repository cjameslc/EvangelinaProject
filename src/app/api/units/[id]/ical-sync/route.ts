import { NextRequest, NextResponse } from "next/server";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { syncUnitFromAirbnb } from "@/lib/icalSync";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!await isUnitInScope(user, params.id)) return forbiddenUnitScopeResponse(user);

  const result = await syncUnitFromAirbnb(params.id);
  await logAudit(user.id, "unit.ical_sync", "Unit", params.id, result);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
