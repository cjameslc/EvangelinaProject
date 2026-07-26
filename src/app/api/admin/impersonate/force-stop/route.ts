import { NextRequest, NextResponse } from "next/server";
import { getToken, encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

/**
 * Redirect target for an impersonation session that's timed out (see the
 * 30-minute check in src/middleware.ts) — not a page a real login flow
 * ever hits. Finalizes the ImpersonationSession audit row and restores the
 * admin's own identity into the session cookie server-side, the same way
 * the "Return to My Account" button's useSession().update() does, just
 * without a client round-trip (this request IS the trigger).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  const url = new URL("/", req.url);
  if (!secret) return NextResponse.redirect(url);

  const token = await getToken({ req, secret });
  if (!token?.impersonating || !token.realUser) return NextResponse.redirect(url);

  const reason = req.nextUrl.searchParams.get("reason") === "timeout" ? "timeout" : "manual";

  if (token.impersonationSessionId) {
    await prisma.impersonationSession.updateMany({
      where: { id: token.impersonationSessionId as string, endedAt: null },
      data: {
        endedAt: new Date(),
        durationSeconds: token.impersonationStartedAt ? Math.round((Date.now() - (token.impersonationStartedAt as number)) / 1000) : null,
        endReason: reason,
      },
    }).catch(() => {});
  }

  const real = token.realUser;
  const restored = {
    ...token,
    id: real.id, name: real.name, username: real.username, email: real.email ?? undefined,
    role: real.role, ownedUnitIds: real.ownedUnitIds, avatarColor: real.avatarColor, mustChangePassword: real.mustChangePassword,
  };
  delete restored.realUser;
  delete restored.impersonating;
  delete restored.impersonationSessionId;
  delete restored.impersonationStartedAt;
  delete restored.impersonationLastActivityAt;

  const response = NextResponse.redirect(url);
  const cookieName = SESSION_COOKIE_NAMES.find((n) => req.cookies.get(n)) ?? SESSION_COOKIE_NAMES[1];
  const encoded = await encode({ token: restored, secret });
  response.cookies.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieName.startsWith("__Secure-"),
  });
  return response;
}
