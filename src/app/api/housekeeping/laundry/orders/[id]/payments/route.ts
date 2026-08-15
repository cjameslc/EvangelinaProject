import { NextRequest, NextResponse } from "next/server";
import { requireUser, isUnitInScope } from "@/lib/session";
import { hasActionAccess } from "@/lib/actionAccess";
import { parseOrError } from "@/lib/apiValidation";
import { laundryPaymentSchema } from "@/lib/validation";
import { getLaundryOrder, addLaundryPayment } from "@/lib/laundry/laundryService";
import { withDerived } from "@/lib/laundry/laundryReports";
import { rateLimit } from "@/lib/rateLimit";

// Recording a payment is a financial write — Auditor/Housekeeping are
// read-only on financial records app-wide by default (see
// housekeeping.financial in src/lib/actionAccess.ts), so even though
// Housekeeping can otherwise edit a laundry order's status, they can't log
// a payment against one unless an Owner has specifically granted it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.financial", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`laundry-payment:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const existing = await getLaundryOrder(params.id, user.ownerId);
  if (!existing) return NextResponse.json({ error: "Laundry order not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });
  if (existing.status === "Cancelled") return NextResponse.json({ error: "This order is cancelled." }, { status: 400 });

  const parsed = parseOrError(laundryPaymentSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  try {
    await addLaundryPayment(params.id, user.id, parsed.data, user.ownerId);
    const order = await getLaundryOrder(params.id, user.ownerId);
    return NextResponse.json(withDerived(order!), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't record the payment." }, { status: 400 });
  }
}
