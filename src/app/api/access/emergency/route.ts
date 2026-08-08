import { NextResponse } from "next/server";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canGrantEmergencyAccess } from "@/lib/rbac";
import { createEmergencyCredential } from "@/lib/access/service";

// OWNER_ADMIN-only standalone unit access code — outside the normal
// per-booking flow (no booking required), always requires a reason, always
// logged. See src/lib/access/service.ts#createEmergencyCredential.
export async function POST(req: Request) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!canGrantEmergencyAccess(user.role)) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const unitId = typeof body.unitId === "string" ? body.unitId : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const hours = typeof body.hours === "number" && body.hours > 0 && body.hours <= 168 ? body.hours : 24;
  if (!unitId) return NextResponse.json({ error: "unitId is required." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "A reason is required for emergency access." }, { status: 400 });
  if (!await isUnitInScope(user, unitId)) return NextResponse.json({ error: "Unit not found." }, { status: 404 });

  try {
    const credential = await createEmergencyCredential({
      unitId,
      actorUserId: user.id,
      reason,
      validUntil: new Date(Date.now() + hours * 3600 * 1000),
    });
    return NextResponse.json(credential);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create emergency access code." }, { status: 400 });
  }
}
