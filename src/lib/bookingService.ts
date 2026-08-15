import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit, isUnitInScope } from "@/lib/session";
import { bookingSchema, normalizeStayTypeForPlatform } from "@/lib/validation";
import { syncCalendarMirror } from "@/lib/calendarMirror";
import { checkAvailability } from "@/lib/bookingEngine/availabilityService";
import { notify } from "@/lib/bookingEngine/notificationService";
import { generateConfirmationNumber } from "@/lib/bookingEngine/confirmationNumber";

export type BookingInput = z.infer<typeof bookingSchema>;

export type CreateBookingResult =
  | { ok: true; booking: Awaited<ReturnType<typeof prisma.booking.create>> }
  | { ok: false; error: string };

// Thrown inside the $transaction below to abort/roll back on a genuine
// conflict — caught just outside to turn back into the normal
// { ok: false, error } result shape the rest of the app expects.
class BookingConflictError extends Error {}

// Same idea, for a coupon that turns out to be invalid (or races another
// booking claiming its last remaining use) at the moment the transaction
// actually commits — the guest bookings route already re-validates the
// coupon once before opening this transaction, but that check alone isn't
// safe against two concurrent bookings both passing it and both trying to
// claim the same limited coupon's last use.
class CouponConflictError extends Error {}

/**
 * Shared by both createBookingRecord (staff) and createGuestBooking (Guest
 * Portal) — the overlap guard, the actual row, the mirrored CalendarBlock,
 * and the notify() event are identical either way. Only the caller-specific
 * bits (unit-scope check + audit log for staff; guestId for guests) live
 * outside this function, so there is exactly one creation path underneath,
 * not two copies of it.
 */
async function createBookingCore(body: BookingInput & { guestId?: string | null }): Promise<CreateBookingResult> {
  const dayStart = new Date(body.date);
  const checkOutDate = body.checkOutDate ? new Date(body.checkOutDate) : null;
  const stayType = normalizeStayTypeForPlatform(body.platform, body.stayType);

  // Flexible has no fixed window like Daycation/Night — without a real
  // check-in/check-out time there's nothing for the real time-of-day
  // overlap check (bookingsConflict) to compare against.
  if (stayType === "Flexible" && (!body.checkInTime || !body.checkOutTime)) {
    return { ok: false, error: "A Flexible stay needs both a check-in and check-out time." };
  }

  const confirmationNumber = await generateConfirmationNumber(body.unitId);

  // The overlap guard (checkAvailability) and the actual insert have to
  // happen as one atomic unit — otherwise two near-simultaneous requests
  // for the same unit/date/stayType can both pass the guard before either
  // one's create() commits, producing a genuine double-booking. Wrapping
  // both in a single $transaction serializes that whole read-then-write
  // sequence against any other transaction touching this connection, so a
  // second request's own guard-check inside its own transaction can only
  // run after the first transaction has fully committed (and will then
  // correctly see the just-created row and reject).
  let booking: Awaited<ReturnType<typeof prisma.booking.create>>;
  try {
    booking = await prisma.$transaction(async (tx) => {
      // Same check the Booking Engine's availability service uses
      // everywhere else, so "is this unit free" only has one
      // implementation — just run against the transaction's own view of
      // the data instead of the outer client. Compares real check-in/
      // check-out timestamps (not just calendar days or stay type), so a
      // multi-night stay correctly blocks every night it spans, and two
      // bookings of different stay types on the same day still conflict
      // whenever their actual occupied windows overlap.
      const { available } = await checkAvailability(
        { unitId: body.unitId, date: dayStart, checkOutDate, stayType, checkInTime: body.checkInTime, checkOutTime: body.checkOutTime },
        { client: tx }
      );
      if (!available) throw new BookingConflictError();

      // Atomically claim this coupon's usage slot as part of the same
      // transaction as the booking itself — if the insert below fails for
      // any reason (or another error is thrown), the claim rolls back with
      // it, so a coupon's usedCount only ever increments for bookings that
      // actually succeeded. Optimistic-concurrency style: increment only
      // succeeds if usedCount hasn't moved since this same transaction just
      // read it, so two concurrent bookings racing a coupon's last
      // remaining use can't both win.
      if (body.couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: body.couponCode } });
        const stillValid = coupon && coupon.active && (!coupon.expiresAt || coupon.expiresAt.getTime() >= Date.now())
          && (coupon.maxUses === null || coupon.usedCount < coupon.maxUses);
        if (!stillValid) throw new CouponConflictError();
        const claim = await tx.coupon.updateMany({
          where: { id: coupon!.id, usedCount: coupon!.usedCount },
          data: { usedCount: { increment: 1 } },
        });
        if (claim.count === 0) throw new CouponConflictError();
      }

      return tx.booking.create({
        data: {
          unitId: body.unitId,
          date: dayStart,
          checkOutDate,
          stayType,
          checkInTime: body.checkInTime || null,
          checkOutTime: body.checkOutTime || null,
          guests: body.guests as any,
          pax: body.pax ?? null,
          contactNumber: body.contactNumber,
          bookerId: body.bookerId || null,
          cleanerId: body.cleanerId || null,
          platform: body.platform,
          platformOther: body.platformOther || null,
          dpAmount: body.dpAmount ?? null,
          dpReceivedById: body.dpReceivedById || null,
          dpMethod: body.dpMethod || null,
          dpProofUrl: body.dpProofUrl || null,
          amount: body.amount,
          receivedById: body.receivedById || null,
          method: body.method || null,
          proofUrl: body.proofUrl || null,
          paid: body.paid ?? false,
          guestId: body.guestId ?? null,
          specialRequest: body.specialRequest || null,
          confirmationNumber,
          originalAmount: body.originalAmount ?? null,
          discountPct: body.discountPct ?? null,
          paymentType: body.paymentType ?? "full",
          intendedDpAmount: body.intendedDpAmount ?? null,
          notes: body.notes || null,
          couponCode: body.couponCode || null,
          couponDiscountAmount: body.couponDiscountAmount ?? null,
        },
      });
    });
  } catch (e) {
    if (e instanceof BookingConflictError) {
      return { ok: false, error: "This unit already has a booking that overlaps this check-in/check-out window." };
    }
    if (e instanceof CouponConflictError) {
      return { ok: false, error: "That coupon just became unavailable. Please remove it and try again." };
    }
    throw e;
  }

  // Mirror onto the calendar so /calendar shows it immediately. Housekeeping's
  // cleaning schedule and every dashboard/report figure read live from this
  // same Booking row (no separate "generate housekeeping/finance records"
  // step exists elsewhere in the app), so nothing else needs to run here for
  // those to pick it up immediately.
  await syncCalendarMirror(booking);
  await notify({ type: "booking.created", bookingId: booking.id });

  return { ok: true, booking };
}

/**
 * The single place a staff-side Booking row is ever created — the manual
 * "New booking" form (POST /api/bookings) and the Excel/CSV importer both
 * call this same function, so every side effect (the overlap guard, the
 * unit-scope check, the mirrored CalendarBlock, the audit log entry) is
 * identical no matter which path a booking came in through. Never
 * duplicate this logic elsewhere — if a new caller needs to create a
 * booking, it calls this (staff) or createGuestBooking (Guest Portal).
 */
export async function createBookingRecord(
  user: { id: string; role: string; ownedUnitIds: string[]; ownerId: string | null },
  body: BookingInput
): Promise<CreateBookingResult> {
  // A Co-owner can only ever be scoped to their own units on reads (every
  // list query already filters via unitWhere) — this is the write-side
  // equivalent: canEditBookings() lets a Co-owner call this endpoint at
  // all, but nothing stopped them creating a booking for a unit that isn't
  // theirs until this check existed.
  if (!await isUnitInScope(user, body.unitId)) {
    return { ok: false, error: "You don't have access to that unit." };
  }

  const result = await createBookingCore(body);
  if (result.ok) {
    await logAudit(user.id, "booking.create", "Booking", result.booking.id, { unitId: result.booking.unitId, amount: result.booking.amount });
  }
  return result;
}

/**
 * Guest Portal booking creation — no unit-scope check (any active unit is
 * publicly bookable by any guest, unlike a Co-owner's staff-side scope),
 * no staff audit-log entry (there's no acting staff user), always
 * attributed to the given guestId instead of a bookerId.
 */
export async function createGuestBooking(guestId: string, body: BookingInput): Promise<CreateBookingResult> {
  return createBookingCore({ ...body, guestId, bookerId: null, cleanerId: null });
}
