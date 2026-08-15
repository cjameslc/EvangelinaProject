import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { parseOrError } from "@/lib/apiValidation";
import { laundryServiceBaseSchema } from "@/lib/validation";
import { updateLaundryService } from "@/lib/laundry/laundryService";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const parsed = parseOrError(laundryServiceBaseSchema.partial(), await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  try {
    const service = await updateLaundryService(params.id, user.id, parsed.data, user.ownerId);
    return NextResponse.json(service);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't update the service." }, { status: 400 });
  }
}
