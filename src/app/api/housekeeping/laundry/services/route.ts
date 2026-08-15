import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canSeeHousekeeping } from "@/lib/rbac";
import { parseOrError } from "@/lib/apiValidation";
import { laundryServiceSchema } from "@/lib/validation";
import { listLaundryServices, createLaundryService } from "@/lib/laundry/laundryService";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });
  return NextResponse.json(await listLaundryServices(user.ownerId));
}

// Service/pricing configuration is Owner/Admin-only — same tier as
// Settings rates, not a day-to-day Housekeeping action.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const parsed = parseOrError(laundryServiceSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  const service = await createLaundryService(user.id, parsed.data, user.ownerId);
  return NextResponse.json(service, { status: 201 });
}
