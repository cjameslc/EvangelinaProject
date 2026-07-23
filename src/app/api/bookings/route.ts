import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere } from "@/lib/session";
import { bookingSchema } from "@/lib/validation";
import { canEditBookings } from "@/lib/rbac";
import { createBookingRecord } from "@/lib/bookingService";
import { parseOrError } from "@/lib/apiValidation";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  // Explicit select — same fix as the initial page load (src/app/bookings/page.tsx):
  // this is what BookingsView's refresh() re-fetches after every create/edit/
  // delete, so leaving proofUrl/dpProofUrl out here matters just as much.
  const bookings = await prisma.booking.findMany({
    where: unitWhere(user),
    orderBy: { date: "desc" },
    select: {
      id: true, unitId: true, date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true,
      guests: true, pax: true, contactNumber: true, bookerId: true, cleanerId: true, platform: true, platformOther: true,
      dpAmount: true, dpReceivedById: true, dpMethod: true, amount: true, receivedById: true, method: true, paid: true,
      source: true, conflict: true, cancelledAt: true, cancellationReason: true, refundedAt: true, refundReason: true, notes: true,
      confirmationNumber: true,
      unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
      booker: { select: { id: true, name: true } },
      cleaner: { select: { id: true, name: true } },
      dpReceivedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(bookings);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  // Staff-only surface (not guest-facing), but still worth a generous cap —
  // one account spamming create/edit/cancel/refund/delete shares this same
  // bucket (see the other four handlers under src/app/api/bookings/).
  const limited = rateLimit(`booking-mutate:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const parsed = parseOrError(bookingSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  // Mirror BookingForm.tsx's own lock server-side: whoever is logged in and
  // has their own Employee record is the booker on a manually-created
  // booking, full stop — the client-submitted bookerId is never trusted for
  // this endpoint, since BOOKER and HOUSEKEEPING both earn a real ₱100
  // commission + Elite Challenge credit off whoever bookerId names. Only
  // applies here (the "New booking" form's create path) — the Excel/CSV
  // importer calls createBookingRecord directly with a bookerId resolved
  // per-row from the sheet's own "Booker Name" column and must keep doing
  // that, since a bulk import's rows can each have a different real booker.
  const ownEmployee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (ownEmployee) body.bookerId = ownEmployee.id;

  const result = await createBookingRecord(user, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result.booking, { status: 201 });
}
