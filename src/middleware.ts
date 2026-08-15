import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { effectivePageAccess } from "@/lib/pageAccess";

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

/**
 * Edge middleware can't hold a live Prisma connection, so this hits the app's
 * own tiny cached flag endpoint instead (see getCachedMaintenanceFlag /
 * /api/deployment/maintenance-flag), which does the real (unstable_cache'd)
 * DB read. `next: { revalidate }` on this fetch is a Route
 * Handler/Server Component data-cache feature — it isn't documented as
 * guaranteed to apply inside Edge Middleware specifically, so this also
 * keeps its own best-effort module-scope cache (persists across requests
 * on a warm edge instance, not a hard guarantee across every instance/
 * region) as a second layer: on the very common case of a cache hit, this
 * skips the network hop entirely instead of paying it on every single
 * staff page load. Fails open on any error — never let a flag-check hiccup
 * lock staff out of the app.
 */
let maintenanceFlagCache: { value: boolean; fetchedAt: number } | null = null;
const MAINTENANCE_FLAG_TTL_MS = 15_000;

async function isMaintenanceActive(req: { url: string }): Promise<boolean> {
  if (maintenanceFlagCache && Date.now() - maintenanceFlagCache.fetchedAt < MAINTENANCE_FLAG_TTL_MS) {
    return maintenanceFlagCache.value;
  }
  try {
    const res = await fetch(new URL("/api/deployment/maintenance-flag", req.url), { next: { revalidate: 15 } });
    if (!res.ok) return maintenanceFlagCache?.value ?? false;
    const data = (await res.json()) as { active?: boolean };
    const value = !!data.active;
    maintenanceFlagCache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    // Serve the last known value rather than a hard "false" on a transient
    // blip — closer to the real state than always assuming "not active".
    return maintenanceFlagCache?.value ?? false;
  }
}

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
      // effectivePageAccess folds in Access Management's per-member
      // additive grants (token.additionalPageAccess, kept fresh by the
      // same throttled DB revalidation the jwt() callback already does for
      // role/ownerId — no extra DB call needed here at the edge) on top of
      // ROUTE_ROLES' own role defaults, so a grant takes effect here, not
      // just in the nav. Hiding a tab is not enforcement on its own — this
      // is the actual gate a direct URL visit still has to pass.
      const allowed = matched
        ? effectivePageAccess(role, (token?.additionalPageAccess as string[] | undefined) ?? [], (token?.ownerEnabledModules as string[] | null | undefined) ?? null).includes(matched)
        : true;
      if (matched && role && !allowed) {
        response = NextResponse.redirect(new URL("/", req.url));
      } else if (matched && role && role !== "OWNER_ADMIN" && (await isMaintenanceActive(req))) {
        // Full maintenance mode: every staff route this app already
        // role-gates (dashboard/analytics/bookings/calendar/housekeeping/
        // auditor/admin) bounces to the maintenance page for everyone
        // except OWNER_ADMIN, who can still get in to check on things or
        // turn maintenance mode back off. The guest-facing site ("/",
        // "/book", "/my-bookings/[id]") isn't in ROUTE_ROLES at all, so
        // `matched` is never true there — untouched by design.
        response = NextResponse.redirect(new URL("/maintenance", req.url));
      } else {
        response = NextResponse.next();
      }
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
