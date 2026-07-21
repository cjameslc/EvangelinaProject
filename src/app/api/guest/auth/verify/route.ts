import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrCreateGuestByEmail } from "@/lib/bookingEngine/guestService";
import { mintGuestSessionToken, guestCookieOptions, GUEST_COOKIE_NAME } from "@/lib/guestSession";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const invalid = () => NextResponse.redirect(new URL("/guest-login?error=invalid", req.url));
  if (!token) return invalid();

  const record = await prisma.guestLoginToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return invalid();

  await prisma.guestLoginToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  const guest = await findOrCreateGuestByEmail(record.email);

  const sessionToken = await mintGuestSessionToken(guest);
  const res = NextResponse.redirect(new URL("/my-bookings", req.url));
  res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
  return res;
}
