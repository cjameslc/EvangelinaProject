import { NextRequest, NextResponse } from "next/server";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canSeeHousekeeping, canEditHousekeeping } from "@/lib/rbac";
import { parseOrError } from "@/lib/apiValidation";
import { laundryOrderSchema } from "@/lib/validation";
import { getLaundryOrder, updateLaundryOrder } from "@/lib/laundry/laundryService";
import { withDerived } from "@/lib/laundry/laundryReports";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const order = await getLaundryOrder(params.id);
  if (!order) return NextResponse.json({ error: "Laundry order not found." }, { status: 404 });
  if (!await isUnitInScope(user, order.unitId)) return new Response("Forbidden", { status: 403 });

  return NextResponse.json(withDerived(order));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const existing = await getLaundryOrder(params.id);
  if (!existing) return NextResponse.json({ error: "Laundry order not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });
  if (existing.status === "Cancelled") return NextResponse.json({ error: "This order is cancelled and can't be edited." }, { status: 400 });

  const parsed = parseOrError(laundryOrderSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  if (parsed.data.unitId && !await isUnitInScope(user, parsed.data.unitId)) return new Response("Forbidden", { status: 403 });

  try {
    const order = await updateLaundryOrder(params.id, user.id, parsed.data);
    return NextResponse.json(withDerived(order));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't update the laundry order." }, { status: 400 });
  }
}
