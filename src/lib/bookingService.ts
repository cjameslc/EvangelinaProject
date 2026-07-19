import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/session";
import { bookingSchema, normalizeStayTypeForPlatform } from "@/lib/validation";
import { syncCalendarMirror, bookingsConflict } from "@/lib/calendarMirror";

export type BookingInput = z.infer<typeof bookingSchema>;

export type CreateBookingResult =
  | { ok: true; booking: Awaited<ReturnType<typeof prisma.booking.create>> }
  | { ok: false; error: string };

/**
 * The single place a Booking row is ever created — the manual "New booking"
 * form (POST /api/bookings) and the Excel/CSV importer both call this same
 * function, so every side effect (the overlap guard, the mirrored
 * CalendarBlock, the audit log entry) is identical no matter which path a
 * booking came in through. Never duplicate this logic elsewhere — if a new
 * caller needs to create a booking, it calls this.
 */
export async function createBookingRecord(userId: string, body: BookingInput): Promise<CreateBookingResult> {
  const dayStart = new Date(body.date);
  const checkOutDate = body.checkOutDate ? new Date(body.checkOutDate) : null;
  const stayType = normalizeStayTypeForPlatform(body.platform, body.stayType);

  // Overlap guard: compares actual occupied date ranges (not just exact
  // check-in date matches), so a multi-night stay correctly blocks every
  // night it spans — not only bookings whose check-in happens to land on
  // the exact same day. Daycation and Night may still share a single day
  // (different time slots); Full always blocks the whole day.
  const unitBookings = await prisma.booking.findMany({
    where: { unitId: body.unitId },
    select: { stayType: true, date: true, checkOutDate: true },
  });
  const conflict = unitBookings.some((b) => bookingsConflict({ stayType, date: dayStart, checkOutDate }, b));
  if (conflict) {
    return { ok: false, error: "This unit already has a booking that overlaps this date and stay type." };
  }

  const booking = await prisma.booking.create({
    data: {
      unitId: body.unitId,
      date: dayStart,
      checkOutDate,
      stayType,
      checkInTime: body.checkInTime || null,
      checkOutTime: body.checkOutTime || null,
      guests: body.guests,
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
    },
  });

  // Mirror onto the calendar so /calendar shows it immediately. Housekeeping's
  // cleaning schedule and every dashboard/report figure read live from this
  // same Booking row (no separate "generate housekeeping/finance records"
  // step exists elsewhere in the app), so nothing else needs to run here for
  // those to pick it up immediately.
  await syncCalendarMirror(booking);

  await logAudit(userId, "booking.create", "Booking", booking.id, { unitId: booking.unitId, amount: booking.amount });
  return { ok: true, booking };
}
