import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { mintGuestSessionToken, guestCookieOptions, GUEST_COOKIE_NAME } from "@/lib/guestSession";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isConfirmationValid } from "@/lib/bookingEngine/confirmationValidity";
import { findOrCreateGuestByEmail } from "@/lib/bookingEngine/guestService";
import { createGuestAccessCode } from "@/lib/access/service";

/**
 * The short link behind "🔗 View Your Booking" (composed in
 * DoorCodeReveal.tsx) — /b/{confirmationNumber}, nothing else. A
 * confirmationNumber is already unique per booking (see prisma/schema.prisma),
 * so a separate bookingId in the URL was redundant — this replaces the
 * longer /api/guest/auth/verify-booking-link?bookingId=…&cn=… link with the
 * shortest URL that still carries the credential, same trust boundary as
 * confirmation-number login (verify-confirmation/route.ts): the
 * confirmationNumber IS the credential, just carried in the link instead of
 * typed into a form. Mints the guest's session server-side and redirects
 * straight to their booking — no login form, nothing to type.
 */
export async function GET(req: NextRequest, { params }: { params: { cn: string } }) {
  const cn = decodeURIComponent(params.cn ?? "").trim().toUpperCase();
  const invalid = () => NextResponse.redirect(new URL("/guest-login?error=invalid", req.url));
  if (!cn) return invalid();

  const ipLimit = rateLimit(`guest-link-auth-ip:${clientIp(req)}`, 15, 60 * 60 * 1000);
  const globalLimit = rateLimit("guest-link-auth-global", 120, 60 * 60 * 1000);
  if (!ipLimit.ok || !globalLimit.ok) return invalid();

  const booking = await prisma.booking.findUnique({
    where: { confirmationNumber: cn },
    select: {
      id: true, date: true, checkOutDate: true, cancelledAt: true, confirmationOverrideUntil: true,
      guests: true,
      guest: { select: { id: true, email: true, name: true } },
      unitId: true, stayType: true, checkInTime: true, checkOutTime: true, platform: true,
    },
  });

  if (!booking || !isConfirmationValid(booking)) return invalid();

  // Same bootstrap as verify-confirmation/route.ts — a staff-logged booking
  // has a confirmationNumber but no Guest account until first accessed.
  let guest = booking.guest;
  if (!guest) {
    const guestNames: string[] = Array.isArray(booking.guests) ? booking.guests : [];
    const placeholderEmail = `guest-${cn.toLowerCase()}@guest.evangelinas.local`;
    guest = await findOrCreateGuestByEmail(placeholderEmail, guestNames[0] ?? null);
    await prisma.booking.update({ where: { id: booking.id }, data: { guestId: guest.id } });
  }

  // Same real gap fix as verify-confirmation/route.ts — a staff-logged
  // booking never gets a door code at creation time; this is the first
  // moment it's guest-portal-reachable. Idempotent, so safe to call
  // whether or not the guest account above was just bootstrapped.
  waitUntil(
    createGuestAccessCode({
      bookingId: booking.id, unitId: booking.unitId, guestId: guest.id, stayType: booking.stayType,
      date: booking.date, checkOutDate: booking.checkOutDate, checkInTime: booking.checkInTime, checkOutTime: booking.checkOutTime,
      platform: booking.platform,
    }).catch(() => {})
  );

  const sessionToken = await mintGuestSessionToken(guest);
  const res = NextResponse.redirect(new URL(`/my-bookings/${booking.id}`, req.url));
  res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
  return res;
}
