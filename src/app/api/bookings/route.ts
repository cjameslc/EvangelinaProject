import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere } from "@/lib/session";
import { bookingSchema } from "@/lib/validation";
import { hasActionAccess } from "@/lib/actionAccess";
import { createBookingRecord } from "@/lib/bookingService";
import { parseOrError } from "@/lib/apiValidation";
import { rateLimit } from "@/lib/rateLimit";
import { createGuestAccessCode } from "@/lib/access/service";

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  // Optional lower date bound — BookingsView's default load only needs a
  // recent window (see src/app/bookings/page.tsx), and refresh() after a
  // mutation re-requests exactly whatever window is already on screen. No
  // `since` = today's original unbounded behavior, used by the explicit
  // "Show older bookings" escape hatch.
  const since = req.nextUrl.searchParams.get("since");
  const sinceDate = since ? new Date(`${since}T00:00:00Z`) : null;

  // Explicit select — same fix as the initial page load (src/app/bookings/page.tsx):
  // this is what BookingsView's refresh() re-fetches after every create/edit/
  // delete, so leaving proofUrl/dpProofUrl out here matters just as much.
  const bookings = await prisma.booking.findMany({
    where: { ...unitWhere(user), ...(sinceDate ? { date: { gte: sinceDate } } : {}) },
    orderBy: { date: "desc" },
    select: {
      id: true, unitId: true, date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true,
      guests: true, pax: true, contactNumber: true, bookerId: true, cleanerId: true, platform: true, platformOther: true,
      dpAmount: true, dpReceivedById: true, dpMethod: true, amount: true, receivedById: true, method: true, paid: true,
      source: true, conflict: true, checkedInAt: true, checkedOutAt: true, cancelledAt: true, cancellationReason: true, cancellationCategory: true, refundedAt: true, refundReason: true, notes: true,
      confirmationNumber: true, confirmationOverrideUntil: true,
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
  if (!hasActionAccess("bookings.create", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

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
  const ownEmployee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true } });
  if (ownEmployee) body.bookerId = ownEmployee.id;

  // A role/member without the financial action (Housekeeping by default)
  // may still log a new booking's price at intake (amount is a required
  // field of the form/schema and that ability is genuinely relied on
  // today), but may not create it pre-marked as paid — same "never write
  // financial records" boundary as the PATCH route's field-stripping,
  // applied to the one financial fact a brand-new row can assert that an
  // edit can't undo just by omission.
  if (!hasActionAccess("bookings.financial", user.role, user.additionalActionAccess)) body.paid = false;

  const result = await createBookingRecord(user, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  // A real, confirmed gap: unlike the guest self-service route, a
  // staff-logged booking never got a door code generated at all — staff
  // had to remember to separately click "Grant emergency access," and a
  // guest reaching their own confirmation-number bootstrap (verify-
  // confirmation/route.ts, /b/[cn]) was the only other safety net. This
  // gives every manually-entered booking (phone/iMessage/walk-in) a real
  // code immediately, ready for staff to relay right away — same
  // best-effort waitUntil the guest route already uses; a TTLock hiccup
  // here must never block or fail the booking itself.
  waitUntil(
    createGuestAccessCode({
      bookingId: result.booking.id, unitId: result.booking.unitId, guestId: result.booking.guestId,
      stayType: result.booking.stayType, date: result.booking.date, checkOutDate: result.booking.checkOutDate,
      checkInTime: result.booking.checkInTime, checkOutTime: result.booking.checkOutTime, platform: result.booking.platform,
    }).catch(() => {})
  );

  return NextResponse.json(result.booking, { status: 201 });
}
