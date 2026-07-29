import { NextRequest, NextResponse } from "next/server";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canSeeHousekeeping, canEditHousekeeping } from "@/lib/rbac";
import { parseOrError } from "@/lib/apiValidation";
import { laundryOrderSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import { createLaundryOrder, listLaundryOrdersForUser } from "@/lib/laundry/laundryService";
import { withDerived } from "@/lib/laundry/laundryReports";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  // Bounded — this is the interactive list panel, not an export/report
  // (those call listLaundryOrdersForUser with no take and must see every
  // row). 1000 is generous enough to never truncate real current usage
  // while still capping the same unbounded-growth risk /bookings had.
  const rows = await listLaundryOrdersForUser(user, { take: 1000 });
  return NextResponse.json(rows.map(withDerived));
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`laundry-order-create:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const parsed = parseOrError(laundryOrderSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  if (parsed.data.unitId && !isUnitInScope(user, parsed.data.unitId)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const order = await createLaundryOrder(user.id, parsed.data);
    return NextResponse.json(withDerived(order), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Couldn't create the laundry order." }, { status: 400 });
  }
}
