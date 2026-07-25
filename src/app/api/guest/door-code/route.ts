import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { getCurrentUser } from "@/lib/session";
import { getActiveGuideBooking, getGuestBookingForGuide } from "@/lib/bookingEngine/guestService";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isConfirmationValid } from "@/lib/bookingEngine/confirmationValidity";

/**
 * Reveals the door code from the guest's own session alone — no re-typed
 * confirmation number (a stated product decision this session: the
 * booking ID is validated exactly once at sign-in, then every guest module
 * unlocks automatically, no repeat prompts anywhere). Authorization is
 * still fully server-side and still real: the signed-in session
 * (getCurrentGuest) plus ownership (getGuestBookingForGuide/
 * getActiveGuideBooking both scope strictly to guest.id) plus the stay's
 * own validity window (isConfirmationValid) — a guest can only ever reach
 * their own current stay's code, just without an extra typed step to do
 * it. Rate-limited like every other guest-facing code-check.
 *
 * bookingId is optional: the generic Check-In Guide page (no booking in
 * its URL) resolves the guest's current active stay; the per-booking Guide
 * hub (/my-bookings/[id]) passes its own id so a past/other booking can't
 * be used to fish for an unrelated unit's code.
 *
 * One narrow exception: an OWNER_ADMIN previewing a real booking through
 * Admin → "View as Guest" (/admin/view-as-guest/[bookingId]) has no guest
 * session at all, but needs the exact same SecureDoorCodeCard component to
 * render identically for a true 1:1 QA simulation — so a staff session
 * with an explicit bookingId is accepted too, scoped to that one booking
 * (never "current active stay," which has no meaning for staff).
 */
export async function POST(req: NextRequest) {
  const guest = await getCurrentGuest();
  const body = await req.json().catch(() => ({}));
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;

  if (!guest) {
    const staff = bookingId ? await getCurrentUser() : null;
    if (!staff || staff.role !== "OWNER_ADMIN") {
      return NextResponse.json({ error: "Sign in to see your unit's door code." }, { status: 401 });
    }
    const booking = await prisma.booking.findUnique({ where: { id: bookingId! }, include: { unit: { select: { doorCode: true, name: true } } } });
    if (!booking || !booking.unit.doorCode) return NextResponse.json({ error: "No door code set for that unit." }, { status: 404 });
    return NextResponse.json({ doorCode: booking.unit.doorCode, unitName: booking.unit.name });
  }

  const limited = rateLimit(`door-code:${clientIp(req)}:${guest.id}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts — please wait a bit and try again." }, { status: 429 });

  const booking = bookingId ? await getGuestBookingForGuide(guest.id, bookingId) : await getActiveGuideBooking(guest.id);
  if (!booking || !booking.unit.doorCode || !isConfirmationValid(booking)) {
    return NextResponse.json({ error: "No active stay found for that booking." }, { status: 403 });
  }

  return NextResponse.json({ doorCode: booking.unit.doorCode, unitName: booking.unit.name });
}
