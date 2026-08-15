import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { mintGuestSessionToken, guestCookieOptions, GUEST_COOKIE_NAME } from "@/lib/guestSession";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isConfirmationValid } from "@/lib/bookingEngine/confirmationValidity";
import { findOrCreateGuestByEmail } from "@/lib/bookingEngine/guestService";
import { createGuestAccessCode } from "@/lib/access/service";

/**
 * Second guest sign-in path alongside the existing email magic link (see
 * request-link/route.ts) — confirmation number alone, no email ever
 * required (a stated product decision: entering the booking ID is the
 * whole flow, no added steps). Confirmation numbers are high-entropy
 * (EVA- + 6 chars from a 30-char alphabet, ~729M combinations), so a
 * code-only lookup relies on that entropy plus rate limiting as its real
 * protection instead of a second matching field — a global cap on top of
 * the existing per-IP one, since this is the only gate between a guessed
 * code and a real door lock.
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
 * code resolves to a guestless booking, a Guest account is bootstrapped
 * automatically with a placeholder (non-deliverable) email keyed to the
 * confirmation number itself — no input needed from the guest — and
 * linked to the booking. This does mean each previously-guestless booking
 * gets its own separate Guest record rather than being consolidated under
 * a real email a repeat guest might share across bookings; accepted
 * tradeoff for zero-friction access. That guest can still link a real,
 * permanent account later via the email magic-link path if they want one.
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
      // Needed for createGuestAccessCode below — a staff-logged booking
      // never gets one at creation time (see that function's own doc
      // comment), so this bootstrap moment — the first time it's actually
      // reachable through the guest portal — is the real point to ensure
      // one exists.
      unitId: true, stayType: true, checkInTime: true, checkOutTime: true, platform: true,
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
  // leaving those guests locked out of their own valid code, or asking
  // them for an email they don't want to type, bootstrap one silently —
  // the placeholder email is unique per confirmation number (never
  // collides, never sends real mail) and the booking is retroactively
  // linked so this exact same code keeps working instantly from here on.
  if (!booking.guest) {
    const guestNames: string[] = Array.isArray(booking.guests) ? booking.guests : [];
    const placeholderEmail = `guest-${confirmationNumber.toLowerCase()}@guest.evangelinas.local`;
    const guest = await findOrCreateGuestByEmail(placeholderEmail, guestNames[0] ?? null);
    await prisma.booking.update({ where: { id: booking.id }, data: { guestId: guest.id } });
    // A real, confirmed gap: a staff-logged booking never gets a door code
    // at creation time (createGuestAccessCode is only ever wired into the
    // guest self-service booking route) — this bootstrap is the first
    // moment this booking is guest-portal-reachable at all, so it's the
    // right place to ensure a working code exists rather than leaving the
    // guest to find out it's missing at the door. Idempotent (no-ops if an
    // ACTIVE credential already exists), so safe even if something else
    // already created one.
    waitUntil(
      createGuestAccessCode({
        bookingId: booking.id, unitId: booking.unitId, guestId: guest.id, stayType: booking.stayType,
        date: booking.date, checkOutDate: booking.checkOutDate, checkInTime: booking.checkInTime, checkOutTime: booking.checkOutTime,
        platform: booking.platform,
      }).catch(() => {})
    );
    const sessionToken = await mintGuestSessionToken(guest);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
    return res;
  }

  if (emailRaw && booking.guest.email.toLowerCase() !== emailRaw) {
    return NextResponse.json({ error: "We couldn't find an active booking with that ID." }, { status: 404 });
  }

  // Same safety net for a booking whose guest account already existed —
  // idempotent, so this is a no-op the overwhelming majority of the time.
  waitUntil(
    createGuestAccessCode({
      bookingId: booking.id, unitId: booking.unitId, guestId: booking.guest.id, stayType: booking.stayType,
      date: booking.date, checkOutDate: booking.checkOutDate, checkInTime: booking.checkInTime, checkOutTime: booking.checkOutTime,
      platform: booking.platform,
    }).catch(() => {})
  );

  const sessionToken = await mintGuestSessionToken(booking.guest);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
  return res;
}
