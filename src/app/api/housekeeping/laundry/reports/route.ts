import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canSeeHousekeeping } from "@/lib/rbac";
import { listLaundryOrdersForUser } from "@/lib/laundry/laundryService";
import { withDerived, computeLaundryReports } from "@/lib/laundry/laundryReports";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const rows = await listLaundryOrdersForUser(user);
  return NextResponse.json(computeLaundryReports(rows.map(withDerived)));
}
