import { encode, decode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

// Guest sessions are a completely separate mechanism from staff auth (see
// the Guest model's schema comment) — own cookie name, own secret
// (GUEST_SESSION_SECRET, not NEXTAUTH_SECRET), so there is zero shared
// state with next-auth's own session handling and zero risk of a guest
// change ever regressing staff login. Reuses next-auth/jwt's encode/decode
// only because it's an already-present, well-tested JWT implementation —
// not because this is a next-auth session in any functional sense.
export const GUEST_COOKIE_NAME = "guest-session-token";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

if (!process.env.GUEST_SESSION_SECRET) {
  // Fail loudly at startup rather than silently — without this, decode()
  // below throws on every request and getCurrentGuest() just looks like
  // "everyone is signed out," which is a much harder bug to spot.
  throw new Error("GUEST_SESSION_SECRET is not set — guest sessions cannot work without it.");
}
const secret = process.env.GUEST_SESSION_SECRET;

export type GuestIdentity = { id: string; email: string; name: string | null };

export async function mintGuestSessionToken(guest: GuestIdentity) {
  // `encode`'s token type is this project's staff-augmented JWT shape
  // (id/username/role/ownedUnitIds — see the next-auth type augmentation) —
  // a guest token is deliberately a different, smaller shape, so this cast
  // is intentional, not a type-safety gap being papered over.
  return encode({ token: { sub: guest.id, email: guest.email, name: guest.name } as any, secret, maxAge: MAX_AGE });
}

export const guestCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

/** Server Components / API routes: who's the currently signed-in guest, if any. */
export async function getCurrentGuest(): Promise<GuestIdentity | null> {
  const raw = cookies().get(GUEST_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const token = await decode({ token: raw, secret });
    if (!token?.sub) return null;
    return await prisma.guest.findUnique({ where: { id: token.sub as string }, select: { id: true, email: true, name: true } });
  } catch {
    return null;
  }
}
