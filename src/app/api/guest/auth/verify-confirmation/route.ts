import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mintGuestSessionToken, guestCookieOptions, GUEST_COOKIE_NAME } from "@/lib/guestSession";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isConfirmationValid } from "@/lib/bookingEngine/confirmationValidity";
import { findOrCreateGuestByEmail } from "@/lib/bookingEngine/guestService";

/**
 * Second guest sign-in path alongside the existing email magic link (see
 * request-link/route.ts) — confirmation number alone, no email round trip
 * needed (email is accepted and, if sent, still checked — the standalone
 * /guest-login "Booking confirmation" tab still asks for both — but the
 * guest-hub quick-unlock card only asks for the code). Confirmation
 * numbers are high-entropy (EVA- + 6 chars from a 30-char alphabet, ~729M
 * combinations), so a code-only lookup relies on that entropy plus rate
 * limiting as its real protection instead of a second matching field —
 * tightened here accordingly: a global cap on top of the existing
 * per-IP one, since this is now the only gate between a guessed code and
 * a real door lock.
 *
 * The code itself is stay-scoped, not a permanent credential — it stops
 * working once the stay (or an OWNER_ADMIN's reactivation window) has
 * passed, same as the WiFi/door-code reveal (see confirmationValidity.ts).
 * The email magic link remains a permanent way back into a guest's
 * account regardless of how old the booking is.
 *
 * Staff-logged and Airbnb-imported bookings also get a confirmationNumber
 * (every booking does, regardless of how it was created) but have no
 * linked Guest account (nothing in those creation paths collects one) —
 * without handling that, those guests' otherwise-valid codes would be
 * permanently unusable everywhere confirmationNumber is checked (this
 * endpoint, plus the WiFi/door-code reveal, which only ever resolves a
 * booking through the *signed-in* guest's own guestId). So when a valid
 * code resolves to a guestless booking, this step requires an email,
 * find-or-creates a Guest for it, and links it to the booking — a one-time
 * account bootstrap, not a repeat step; the code alone works from then on
 * through either sign-in path. This does mean a valid-but-guestless code
 * gets a distinguishable ("needs email") response instead of the fully
 * generic 404 used everywhere else — a narrow, accepted enumeration gap
 * (confirms a *guessed* code is real, nothing more) given the same code
 * space size and rate limiting already relied on above.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const confirmationNumber = typeof body.confirmationNumber === "string" ? body.confirmationNumber.trim().toUpperCase() : "";

  if (!confirmationNumber) {
    return NextResponse.json({ error: "Enter your booking ID." }, { status: 400 });
  }
  // Only enforce the email format/match when one was actually sent.
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const ipLimit = rateLimit(`guest-conf-login-ip:${clientIp(req)}`, 15, 60 * 60 * 1000);
  // A shared bucket across every request regardless of source IP — the
  // per-IP limit above is easy to route around with enough source
  // addresses; this bounds total guesses against the whole codebase in a
  // given window even from a distributed attempt.
  const globalLimit = rateLimit("guest-conf-login-global", 120, 60 * 60 * 1000);
  if (!ipLimit.ok || !globalLimit.ok) {
    return NextResponse.json({ error: "Too many attempts — please wait a bit and try again." }, { status: 429 });
  }

  const booking = await prisma.booking.findUnique({
    where: { confirmationNumber },
    select: {
      id: true, date: true, checkOutDate: true, cancelledAt: true, confirmationOverrideUntil: true,
      guests: true,
      guest: { select: { id: true, email: true, name: true } },
    },
  });

  // Deliberately the same generic error whether the code doesn't exist,
  // a supplied email doesn't match, or the code has simply expired —
  // never confirm which part was wrong.
  if (!booking || !isConfirmationValid(booking)) {
    return NextResponse.json({ error: "We couldn't find an active booking with that ID." }, { status: 404 });
  }

  // Staff-logged and Airbnb-imported bookings get a confirmationNumber
  // just like guest self-service ones, but never had a Guest account
  // created for them (nothing in that flow collects one). Rather than
  // leaving those guests permanently locked out of their own valid code,
  // link one now: an email is required at this specific step (there's no
  // account to sign into without one), then the booking is retroactively
  // linked so this same code works instantly next time via either path.
  if (!booking.guest) {
    if (!emailRaw) {
      return NextResponse.json(
        { error: "This booking needs your email to finish setting up your account.", needsEmail: true },
        { status: 400 }
      );
    }
    const guestNames: string[] = Array.isArray(booking.guests) ? booking.guests : [];
    const guest = await findOrCreateGuestByEmail(emailRaw, guestNames[0] ?? null);
    await prisma.booking.update({ where: { id: booking.id }, data: { guestId: guest.id } });
    const sessionToken = await mintGuestSessionToken(guest);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
    return res;
  }

  if (emailRaw && booking.guest.email.toLowerCase() !== emailRaw) {
    return NextResponse.json({ error: "We couldn't find an active booking with that ID." }, { status: 404 });
  }

  const sessionToken = await mintGuestSessionToken(booking.guest);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
  return res;
}
