import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { bookingRefundSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";
import { rateLimit } from "@/lib/rateLimit";
import { canEditSpecificBooking } from "@/lib/rbac";
import { hasActionAccess } from "@/lib/actionAccess";

// Marks a booking's payment as refunded — a factual record ("the money was
// given back"), not a payment action itself. amount/dpAmount/paid are left
// untouched for audit history, same as cancelledAt leaves them untouched.
// This is the ONE thing that always reverses commission (see
// isCommissionEligible in bookingStatus.ts) — a cancellation alone does not,
// as long as the deposit was kept.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  // Marking a booking refunded reverses commission and is, functionally, a
  // financial write — gated the same as editing amount/paid on the PATCH
  // route (bookings.financial), not the general bookings.edit action this
  // route used to share with every other operational change. Previously
  // only checked canEditBookings, which meant a Housekeeping session (role
  // default: read-only on financials) could call this despite the "never
  // write financial records" intent stated in rbac.ts.
  if (!hasActionAccess("bookings.financial", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`booking-mutate:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const existing = await prisma.booking.findUnique({
    where: { id: params.id },
    select: { unitId: true, bookerId: true, refundedAt: true, paid: true, dpAmount: true },
  });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);
  if (user.role === "BOOKER") {
    const ownEmployee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true } });
    if (!canEditSpecificBooking(user.role as any, existing.bookerId, ownEmployee?.id)) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  if (existing.refundedAt) return NextResponse.json({ error: "This booking is already marked refunded." }, { status: 400 });
  if (!existing.paid && !(existing.dpAmount && existing.dpAmount > 0)) {
    return NextResponse.json({ error: "Nothing was collected on this booking to refund." }, { status: 400 });
  }

  const parsed = parseOrError(bookingRefundSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const { reason } = parsed.data;

  // Same atomic-conditional-update pattern as cancel — refundedAt: null in
  // the where clause means a double-click (two requests racing) only lets
  // one of them actually flip the row; the other correctly reports 400
  // instead of both succeeding.
  const { count } = await prisma.booking.updateMany({
    where: { id: params.id, refundedAt: null },
    data: { refundedAt: new Date(), refundReason: reason },
  });
  if (count === 0) return NextResponse.json({ error: "This booking is already marked refunded." }, { status: 400 });
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: params.id } });
  await logAudit(user.id, "booking.refund", "Booking", booking.id, { reason });

  return NextResponse.json(booking);
}
