import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope } from "@/lib/session";
import { bookingSchema, normalizeStayTypeForPlatform } from "@/lib/validation";
import { canEditBookings, canEditSpecificBooking, canDeleteBookings } from "@/lib/rbac";
import { parseOrError } from "@/lib/apiValidation";
import { rateLimit } from "@/lib/rateLimit";
import { syncCalendarMirror } from "@/lib/calendarMirror";
import { checkAvailability } from "@/lib/bookingEngine/availabilityService";
import { notify } from "@/lib/bookingEngine/notificationService";
import { releaseAccessCodeForBooking } from "@/lib/ttlock/reliability";

// Thrown inside the $transaction below to abort/roll back on a genuine
// scheduling conflict — caught just outside to turn back into a 409.
class BookingConflictError extends Error {}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  // Shared bucket across create/edit/cancel/refund/delete (see
  // src/app/api/bookings/route.ts and the cancel/refund routes) — one
  // account spamming any mix of these mutations hits the same cap.
  const limited = rateLimit(`booking-mutate:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  // select-only — this booking's proofUrl/dpProofUrl (base64 receipt/DP
  // images) are never read in this handler, same over-fetching fix already
  // applied to the list-page queries elsewhere in this app.
  const existing = await prisma.booking.findUnique({
    where: { id: params.id },
    select: {
      id: true, unitId: true, bookerId: true, date: true, checkOutDate: true, platform: true, stayType: true,
      checkInTime: true, checkOutTime: true, paid: true, checkedOutAt: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  // canEditBookings() lets a Co-owner call this at all, but says nothing
  // about which unit's bookings they may touch — that's this check. A
  // unitId change (moving the booking to a different unit) is checked
  // against the new unit too, once `body` is parsed below.
  if (!isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });
  // A Booker may only edit the specific booking they themselves logged, not
  // a peer's — the UI already hides the button, this is the server-side
  // backstop so a direct API call can't bypass it.
  let ownEmployeeId: string | undefined;
  if (user.role === "BOOKER") {
    const ownEmployee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    ownEmployeeId = ownEmployee?.id;
    if (!canEditSpecificBooking(user.role as any, existing.bookerId, ownEmployeeId, existing.platform)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const parsed = parseOrError(bookingSchema.partial(), await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (body.unitId && !isUnitInScope(user, body.unitId)) return new Response("Forbidden", { status: 403 });
  const data: any = { ...body };
  // Mirror BookingForm.tsx's own lock (and the create endpoint's identical
  // guard) server-side: a Booker editing their own booking can't reassign
  // who it's credited to via a raw API call with a different bookerId in
  // the body — canEditSpecificBooking above only confirmed the booking
  // already belongs to them, it never re-checked what they're trying to
  // change it to. Every other role keeps the documented ability to
  // reassign the booker when editing.
  if (user.role === "BOOKER" && ownEmployeeId) data.bookerId = ownEmployeeId;
  if (body.date) data.date = new Date(body.date);
  if (body.checkOutDate !== undefined) data.checkOutDate = body.checkOutDate ? new Date(body.checkOutDate) : null;
  if (body.checkedInAt !== undefined) data.checkedInAt = body.checkedInAt ? new Date(body.checkedInAt) : null;
  if (body.checkedOutAt !== undefined) data.checkedOutAt = body.checkedOutAt ? new Date(body.checkedOutAt) : null;

  // Same range-overlap guard as creating a booking — re-checked against every
  // other booking on the unit whenever the date range or stay type changes,
  // so an edit can't silently create a double-booking either. Only actually
  // run when the edit touches one of the fields that guard cares about —
  // otherwise an operational update with no bearing on scheduling (marking a
  // guest checked in/out, marking paid, adding a note, reassigning who
  // received a payment) would get blocked by a conflict the booking already
  // had *before* this edit and that this edit does nothing to change. That
  // exact case isn't hypothetical: several real bookings carry a pre-existing
  // overlap flag from the legacy migration, and "Check in" on one of them was
  // silently failing (a 409 the client's optimistic UI update masked) before
  // this guard was scoped to only the fields it's actually protecting.
  const conflictRelevantFieldsChanged = ["unitId", "date", "checkOutDate", "stayType", "checkInTime", "checkOutTime", "platform"].some((k) => k in body);

  // Whether this specific request is the one that actually flipped paid
  // false→true — read fresh from inside the same transaction as the
  // update below, not the `existing` snapshot taken at the top of this
  // handler. Two concurrent PATCH requests marking the same booking paid
  // (a double-click) can both read that early snapshot as paid=false
  // before either commits, so both would fire a duplicate
  // payment.received notification for one real event otherwise. Relies
  // on the same guarantee the conflict-relevant branch below already
  // leans on for its own race prevention: the libSQL adapter serializes
  // every query on the shared `prisma` client behind one mutex (see
  // src/lib/prisma.ts), so two concurrent $transaction calls here fully
  // serialize — the second one's fresh read only runs after the first's
  // update has already committed.
  let paidBeforeThisUpdate = existing.paid;

  let booking: Awaited<ReturnType<typeof prisma.booking.update>>;
  if (!conflictRelevantFieldsChanged) {
    booking = await prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: params.id }, select: { paid: true } });
      paidBeforeThisUpdate = fresh?.paid ?? existing.paid;
      return tx.booking.update({ where: { id: params.id }, data });
    });
  } else {
    const nextUnitId = data.unitId ?? existing.unitId;
    const nextDate = data.date ?? existing.date;
    const nextCheckOutDate = "checkOutDate" in data ? data.checkOutDate : existing.checkOutDate;
    const nextPlatform = data.platform ?? existing.platform;
    const nextStayType = normalizeStayTypeForPlatform(nextPlatform, data.stayType ?? existing.stayType);
    data.stayType = nextStayType;
    const nextCheckInTime = "checkInTime" in data ? data.checkInTime : existing.checkInTime;
    const nextCheckOutTime = "checkOutTime" in data ? data.checkOutTime : existing.checkOutTime;

    // Same reasoning as booking creation (see createBookingCore in
    // bookingService.ts): the overlap guard and the actual update must be one
    // atomic unit, or two near-simultaneous edits/creates targeting an
    // overlapping range can both pass the guard before either commits.
    try {
      booking = await prisma.$transaction(async (tx) => {
        const { available } = await checkAvailability(
          { unitId: nextUnitId, date: nextDate, checkOutDate: nextCheckOutDate, stayType: nextStayType as any, checkInTime: nextCheckInTime, checkOutTime: nextCheckOutTime },
          { excludeBookingId: params.id, client: tx }
        );
        if (!available) throw new BookingConflictError();
        const fresh = await tx.booking.findUnique({ where: { id: params.id }, select: { paid: true } });
        paidBeforeThisUpdate = fresh?.paid ?? existing.paid;
        return tx.booking.update({ where: { id: params.id }, data });
      });
    } catch (e) {
      if (e instanceof BookingConflictError) {
        return NextResponse.json({ error: "This unit already has a booking that overlaps this check-in/check-out window." }, { status: 409 });
      }
      throw e;
    }
  }
  await logAudit(user.id, "booking.update", "Booking", booking.id, body);

  // Keep the mirrored calendar entry (date/span/type/guest) in sync so an
  // edited booking always shows on its exact — and correctly spanned —
  // date(s) on the /calendar grid, rather than the stale one it had before.
  await syncCalendarMirror(booking);
  // A staff member marking a guest-portal booking paid is exactly the
  // "payment received" event a guest wants to see — fired alongside (not
  // instead of) the general booking.updated event.
  if (!paidBeforeThisUpdate && booking.paid) {
    await notify({ type: "payment.received", bookingId: booking.id });
  }
  await notify({ type: "booking.updated", bookingId: booking.id });

  // Guest checked out (checkedOutAt newly set, via the Booker "Today" quick
  // actions) — release the door-access code back to the pool (reserve) or
  // off the lock (real TTLock code). Best-effort, never blocks the response.
  if (!existing.checkedOutAt && booking.checkedOutAt) {
    waitUntil(releaseAccessCodeForBooking(booking.id).catch(() => {}));
  }

  return NextResponse.json(booking);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  // A Booker no longer gets to hard-delete at all — they cancel instead (see
  // POST /api/bookings/[id]/cancel), which reverses their own commission
  // without destroying the payment/audit trail. Every other role
  // canEditBookings() covers keeps full delete access, unchanged.
  if (!canDeleteBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`booking-mutate:${user.id}`, 60, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const existing = await prisma.booking.findUnique({ where: { id: params.id }, select: { unitId: true, bookerId: true } });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!isUnitInScope(user, existing.unitId)) return new Response("Forbidden", { status: 403 });

  // notify() looks up the booking's guestId to know whether to write a
  // guest notification — has to run before the delete below, or there's
  // no row left for it to find.
  await notify({ type: "booking.cancelled", bookingId: params.id });

  // deleteMany (not delete) so a double-delete race (two requests for the
  // same id) can't throw an unhandled P2025 "record not found" 500 — the
  // second one just deletes 0 rows and gets a clean 404 instead. The
  // mirrored CalendarBlock cascades away with the row (onDelete: Cascade on
  // the bookingId relation), so /calendar never shows an orphaned entry.
  const { count } = await prisma.booking.deleteMany({ where: { id: params.id } });
  if (count === 0) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  await logAudit(user.id, "booking.delete", "Booking", params.id);
  return NextResponse.json({ ok: true });
}
