import { NextRequest, NextResponse } from "next/server";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";
import { parseOrError } from "@/lib/apiValidation";
import { laundryStatusUpdateSchema } from "@/lib/validation";
import { getLaundryOrder, updateLaundryStatus } from "@/lib/laundry/laundryService";
import { withDerived } from "@/lib/laundry/laundryReports";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`laundry-status:${user.id}`, 120, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const existing = await getLaundryOrder(params.id);
  if (!existing) return NextResponse.json({ error: "Laundry order not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });

  const parsed = parseOrError(laundryStatusUpdateSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  try {
    const order = await updateLaundryStatus(params.id, user.id, parsed.data);
    return NextResponse.json(withDerived(order));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't update the order status." }, { status: 400 });
  }
}
