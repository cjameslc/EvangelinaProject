import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const ROUTE_ROLES: Record<string, string[]> = {
  "/dashboard": ["OWNER_ADMIN", "CO_OWNER"],
  "/bookings": ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"],
  "/calendar": ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"],
  "/housekeeping": ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING"],
  "/auditor": ["OWNER_ADMIN", "AUDITOR"],
  "/admin": ["OWNER_ADMIN"],
};

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth.token?.role as string | undefined;

    const matched = Object.keys(ROUTE_ROLES).find((base) => pathname.startsWith(base));
    if (matched && role && !ROUTE_ROLES[matched].includes(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/bookings/:path*", "/calendar/:path*", "/housekeeping/:path*", "/auditor/:path*", "/admin/:path*"],
};
