import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { getCurrentUser } from "@/lib/session";
import { getActiveGuideBooking, getGuestBookingForGuide } from "@/lib/bookingEngine/guestService";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isConfirmationValid } from "@/lib/bookingEngine/confirmationValidity";

/**
 * Same gate as /api/guest/door-code, same reasoning (see that route's
 * comment, including the OWNER_ADMIN "View as Guest" QA-preview exception):
 * the guest's own session plus verified booking ownership is sufficient —
 * no re-typed confirmation number. See SecureWifiCard.
 */
export async function POST(req: NextRequest) {
  const guest = await getCurrentGuest();
  const body = await req.json().catch(() => ({}));
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;

  if (!guest) {
    const staff = bookingId ? await getCurrentUser() : null;
    if (!staff || staff.role !== "OWNER_ADMIN") {
      return NextResponse.json({ error: "Sign in to see your unit's WiFi." }, { status: 401 });
    }
    const booking = await prisma.booking.findUnique({ where: { id: bookingId! }, include: { unit: { select: { wifiSsid: true, wifiPassword: true, name: true } } } });
    if (!booking || !booking.unit.wifiSsid || !booking.unit.wifiPassword) return NextResponse.json({ error: "No WiFi set for that unit." }, { status: 404 });
    return NextResponse.json({ ssid: booking.unit.wifiSsid, password: booking.unit.wifiPassword, unitName: booking.unit.name });
  }

  const limited = rateLimit(`wifi-reveal:${clientIp(req)}:${guest.id}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts — please wait a bit and try again." }, { status: 429 });

  const booking = bookingId ? await getGuestBookingForGuide(guest.id, bookingId) : await getActiveGuideBooking(guest.id);
  if (!booking || !booking.unit.wifiSsid || !booking.unit.wifiPassword || !isConfirmationValid(booking)) {
    return NextResponse.json({ error: "No active stay found for that booking." }, { status: 403 });
  }

  return NextResponse.json({ ssid: booking.unit.wifiSsid, password: booking.unit.wifiPassword, unitName: booking.unit.name });
}
