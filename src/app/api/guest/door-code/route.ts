import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { getActiveGuideBooking, getGuestBookingForGuide } from "@/lib/bookingEngine/guestService";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isConfirmationValid } from "@/lib/bookingEngine/confirmationValidity";

/**
 * The door code is never sent to the client until the guest re-types their
 * own booking confirmation number — a deliberate extra step since the
 * property has 5 units, each with its own code, and a signed-in guest
 * session alone shouldn't be enough to silently hand over a physical
 * access code. Rate-limited like every other guest-facing code-check.
 *
 * bookingId is optional: the generic Check-In Guide page (no booking in
 * its URL) resolves the guest's current active stay; the per-booking Guide
 * hub (/my-bookings/[id]) passes its own id so a past/other booking can't
 * be used to fish for an unrelated unit's code.
 */
export async function POST(req: NextRequest) {
  const guest = await getCurrentGuest();
  if (!guest) return NextResponse.json({ error: "Sign in to see your unit's door code." }, { status: 401 });

  const limited = rateLimit(`door-code:${clientIp(req)}:${guest.id}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts — please wait a bit and try again." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const confirmationNumber = typeof body.confirmationNumber === "string" ? body.confirmationNumber.trim().toUpperCase() : "";
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
  if (!confirmationNumber) return NextResponse.json({ error: "Enter your booking ID." }, { status: 400 });

  const booking = bookingId ? await getGuestBookingForGuide(guest.id, bookingId) : await getActiveGuideBooking(guest.id);
  if (!booking || !booking.unit.doorCode || booking.confirmationNumber?.toUpperCase() !== confirmationNumber || !isConfirmationValid(booking)) {
    return NextResponse.json({ error: "That booking ID doesn't match your active stay." }, { status: 403 });
  }

  return NextResponse.json({ doorCode: booking.unit.doorCode, unitName: booking.unit.name });
}
