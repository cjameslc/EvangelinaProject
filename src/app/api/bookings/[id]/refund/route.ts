import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope } from "@/lib/session";
import { bookingRefundSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";
import { rateLimit } from "@/lib/rateLimit";
import { canEditBookings, canEditSpecificBooking } from "@/lib/rbac";

// Marks a booking's payment as refunded — a factual record ("the money was
// given back"), not a payment action itself. amount/dpAmount/paid are left
// untouched for audit history, same as cancelledAt leaves them untouched.
// This is the ONE thing that always reverses commission (see
// isCommissionEligible in bookingStatus.ts) — a cancellation alone does not,
// as long as the deposit was kept.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`booking-mutate:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const existing = await prisma.booking.findUnique({
    where: { id: params.id },
    select: { unitId: true, bookerId: true, refundedAt: true, paid: true, dpAmount: true },
  });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });
  if (user.role === "BOOKER") {
    const ownEmployee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
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

  const booking = await prisma.booking.update({
    where: { id: params.id },
    data: { refundedAt: new Date(), refundReason: reason },
  });
  await logAudit(user.id, "booking.refund", "Booking", booking.id, { reason });

  return NextResponse.json(booking);
}
