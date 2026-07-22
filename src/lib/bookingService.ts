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

  // Overlap guard — same check the Booking Engine's availability service
  // (checkAvailability) uses everywhere else, so "is this unit free" only
  // has one implementation. Compares actual occupied date ranges (not just
  // exact check-in date matches), so a multi-night stay correctly blocks
  // every night it spans — not only bookings whose check-in happens to
  // land on the exact same day. Daycation and Night may still share a
  // single day (different time slots); Full always blocks the whole day.
  const { available } = await checkAvailability({ unitId: body.unitId, date: dayStart, checkOutDate, stayType, checkInTime: body.checkInTime, checkOutTime: body.checkOutTime });
  if (!available) {
    return { ok: false, error: "This unit already has a booking that overlaps this date and stay type." };
  }

  const confirmationNumber = await generateConfirmationNumber();

  const booking = await prisma.booking.create({
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
    },
  });

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
  user: { id: string; role: string; ownedUnitIds: string[] },
  body: BookingInput
): Promise<CreateBookingResult> {
  // A Co-owner can only ever be scoped to their own units on reads (every
  // list query already filters via unitWhere) — this is the write-side
  // equivalent: canEditBookings() lets a Co-owner call this endpoint at
  // all, but nothing stopped them creating a booking for a unit that isn't
  // theirs until this check existed.
  if (!isUnitInScope(user, body.unitId)) {
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
