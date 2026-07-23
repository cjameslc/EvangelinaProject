import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mintGuestSessionToken, guestCookieOptions, GUEST_COOKIE_NAME } from "@/lib/guestSession";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isConfirmationValid } from "@/lib/bookingEngine/confirmationValidity";

/**
 * Second guest sign-in path alongside the existing email magic link (see
 * request-link/route.ts) — email + confirmation number, no email round
 * trip needed. Confirmation numbers are high-entropy (EVA- + 6 chars from
 * a 30-char alphabet, ~729M combinations) so brute-forcing isn't realistic,
 * but this is still rate-limited like every other guest auth endpoint.
 *
 * The code itself is stay-scoped, not a permanent credential — it stops
 * working once the stay (or an OWNER_ADMIN's reactivation window) has
 * passed, same as the WiFi/door-code reveal (see confirmationValidity.ts).
 * The email magic link remains a permanent way back into a guest's
 * account regardless of how old the booking is.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const confirmationNumber = typeof body.confirmationNumber === "string" ? body.confirmationNumber.trim().toUpperCase() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !confirmationNumber) {
    return NextResponse.json({ error: "Enter your email and confirmation number." }, { status: 400 });
  }

  const ipLimit = rateLimit(`guest-conf-login-ip:${clientIp(req)}`, 15, 60 * 60 * 1000);
  if (!ipLimit.ok) {
    return NextResponse.json({ error: "Too many attempts — please wait a bit and try again." }, { status: 429 });
  }

  const booking = await prisma.booking.findUnique({
    where: { confirmationNumber },
    select: {
      date: true, checkOutDate: true, cancelledAt: true, confirmationOverrideUntil: true,
      guest: { select: { id: true, email: true, name: true } },
    },
  });

  // Deliberately the same generic error whether the code doesn't exist,
  // belongs to a staff-logged booking (no guest), the email doesn't match,
  // or the code has simply expired — never confirm which part was wrong.
  if (!booking?.guest || booking.guest.email.toLowerCase() !== email || !isConfirmationValid(booking)) {
    return NextResponse.json({ error: "We couldn't find a booking with that email and confirmation number." }, { status: 404 });
  }

  const sessionToken = await mintGuestSessionToken(booking.guest);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
  return res;
}
