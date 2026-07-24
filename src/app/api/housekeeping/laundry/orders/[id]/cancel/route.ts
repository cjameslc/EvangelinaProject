import { NextRequest, NextResponse } from "next/server";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";
import { getLaundryOrder, cancelLaundryOrder } from "@/lib/laundry/laundryService";
import { withDerived } from "@/lib/laundry/laundryReports";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const existing = await getLaundryOrder(params.id);
  if (!existing) return NextResponse.json({ error: "Laundry order not found." }, { status: 404 });
  if (!isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "A cancellation reason is required." }, { status: 400 });

  try {
    const order = await cancelLaundryOrder(params.id, user.id, reason);
    return NextResponse.json(withDerived(order));
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't cancel the order." }, { status: 400 });
  }
}
