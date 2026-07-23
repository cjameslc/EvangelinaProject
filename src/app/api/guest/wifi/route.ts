import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { getActiveGuideBooking, getGuestBookingForGuide } from "@/lib/bookingEngine/guestService";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/**
 * Same gate as /api/guest/door-code, same reasoning: the WiFi password is
 * never sent to the client until the guest re-types their own booking
 * confirmation number. See SecureWifiCard.
 */
export async function POST(req: NextRequest) {
  const guest = await getCurrentGuest();
  if (!guest) return NextResponse.json({ error: "Sign in to see your unit's WiFi." }, { status: 401 });

  const limited = rateLimit(`wifi-reveal:${clientIp(req)}:${guest.id}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts — please wait a bit and try again." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const confirmationNumber = typeof body.confirmationNumber === "string" ? body.confirmationNumber.trim().toUpperCase() : "";
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
  if (!confirmationNumber) return NextResponse.json({ error: "Enter your booking ID." }, { status: 400 });

  const booking = bookingId ? await getGuestBookingForGuide(guest.id, bookingId) : await getActiveGuideBooking(guest.id);
  if (!booking || !booking.unit.wifiSsid || !booking.unit.wifiPassword || booking.confirmationNumber?.toUpperCase() !== confirmationNumber) {
    return NextResponse.json({ error: "That booking ID doesn't match your active stay." }, { status: 403 });
  }

  return NextResponse.json({ ssid: booking.unit.wifiSsid, password: booking.unit.wifiPassword, unitName: booking.unit.name });
}
