import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

const ROUTE_ROLES: Record<string, string[]> = {
  "/dashboard": ["OWNER_ADMIN", "CO_OWNER"],
  "/analytics": ["OWNER_ADMIN", "CO_OWNER"],
  "/bookings": ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"],
  "/calendar": ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"],
  "/housekeeping": ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING"],
  "/auditor": ["OWNER_ADMIN", "AUDITOR", "CO_OWNER"],
  "/admin": ["OWNER_ADMIN"],
};

// Admin-impersonation sessions live entirely inside the same signed
// next-auth session cookie (see the jwt() callback in src/lib/auth.ts) — no
// separate impersonation cookie to keep in sync. This is the sliding
// 30-minute inactivity timer: every authenticated request while
// impersonating re-signs the cookie with a bumped
// impersonationLastActivityAt, and a request that arrives after the window
// has lapsed gets redirected to force-stop instead.
const IMPERSONATION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

export default withAuth(
  async function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const role = token?.role as string | undefined;
    const mustChangePassword = token?.mustChangePassword as boolean | undefined;

    let response: NextResponse;

    // Force a password reset before any other page becomes reachable.
    if (mustChangePassword && pathname !== "/change-password") {
      response = NextResponse.redirect(new URL("/change-password", req.url));
    } else if (!mustChangePassword && pathname === "/change-password") {
      response = NextResponse.redirect(new URL("/", req.url));
    } else if (pathname === "/change-password") {
      response = NextResponse.next();
    } else {
      const matched = Object.keys(ROUTE_ROLES).find((base) => pathname.startsWith(base));
      response = matched && role && !ROUTE_ROLES[matched].includes(role)
        ? NextResponse.redirect(new URL("/", req.url))
        : NextResponse.next();
    }

    if (token?.impersonating) {
      const lastActivity = (token.impersonationLastActivityAt as number | undefined) ?? (token.impersonationStartedAt as number | undefined) ?? 0;
      if (Date.now() - lastActivity > IMPERSONATION_TIMEOUT_MS) {
        const stopUrl = new URL("/api/admin/impersonate/force-stop", req.url);
        stopUrl.searchParams.set("reason", "timeout");
        return NextResponse.redirect(stopUrl);
      }

      const secret = process.env.NEXTAUTH_SECRET;
      if (secret) {
        const cookieName = SESSION_COOKIE_NAMES.find((n) => req.cookies.get(n)) ?? SESSION_COOKIE_NAMES[1];
        const refreshed = await encode({ token: { ...token, impersonationLastActivityAt: Date.now() }, secret });
        response.cookies.set(cookieName, refreshed, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: cookieName.startsWith("__Secure-"),
        });
      }
    }

    return response;
  },
  {
    callbacks: {
      // "/" is the public guest homepage now — letting an unauthenticated
      // request through here (instead of the usual !!token gate) is what
      // makes that possible. The middleware function above still runs for
      // authenticated staff hitting "/", so the mustChangePassword redirect
      // is unaffected; src/app/page.tsx itself handles the staff-vs-guest
      // branch (redirect staff to their role's page, render the guest
      // homepage otherwise).
      authorized: ({ token, req }) => req.nextUrl.pathname === "/" || !!token,
    },
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/analytics/:path*",
    "/bookings/:path*",
    "/calendar/:path*",
    "/housekeeping/:path*",
    "/auditor/:path*",
    "/admin/:path*",
    "/profile/:path*",
    "/change-password",
  ],
};
