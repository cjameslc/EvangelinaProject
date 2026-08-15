import type { Role } from "@/lib/prisma-enums";
import "next-auth";
import "next-auth/jwt";

/** Snapshot of the real, signed-in admin's identity — stashed on the token
 * while impersonating so "Return to My Account" can restore it exactly,
 * without a second login. Never present outside an active impersonation. */
type RealUserSnapshot = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: Role;
  ownedUnitIds: string[];
  avatarColor: string;
  mustChangePassword: boolean;
  ownerId: string | null;
  isPlatformAdmin: boolean;
  additionalPageAccess: string[];
  additionalActionAccess: string[];
  ownerBusinessName: string | null;
  ownerLogoUrl: string | null;
  ownerEnabledModules: string[] | null;
  colorTheme: string | null;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      username: string;
      email: string | null;
      role: Role;
      ownedUnitIds: string[];
      avatarColor: string;
      mustChangePassword: boolean;
      // Multi-owner platform layer (see src/lib/ownerScope.ts) — ownerId is
      // null only for a platform-admin-only account with no owner of its
      // own; every regular staff account has one after the foundational
      // migration backfill. Deliberately separate from the pre-existing
      // CO_OWNER/ownedUnitIds concept above, which scopes a subset of
      // *one* owner's units, not which tenant a user belongs to.
      ownerId: string | null;
      isPlatformAdmin: boolean;
      // This user's own tenant's display name/icon (Owner.businessName/
      // logoUrl) — what the nav bar actually renders, falling back to the
      // original static Evangelina's Staycation branding when null (a
      // brand-new owner with no icon uploaded yet, or no session at all).
      ownerBusinessName: string | null;
      ownerLogoUrl: string | null;
      // Per-tenant feature-tier ceiling (Owner.enabledModules) — a
      // restrictive cap, unlike additionalPageAccess below which is purely
      // additive. null means unrestricted. See effectivePageAccess() in
      // src/lib/pageAccess.ts, the one place this and the role/grant layers
      // combine.
      ownerEnabledModules: string[] | null;
      // Personal color theme (User.colorTheme, see src/lib/colorThemes.ts)
      // — a per-account preference, unlike everything else on this owner-
      // scoped block above. null = no preference saved yet (resolves to
      // the default theme in code).
      colorTheme: string | null;
      // Owner-configurable additive page grants on top of the role's own
      // default pages — see effectivePageAccess() in src/lib/pageAccess.ts,
      // the one resolver every layer (nav, middleware, the Access
      // Management API) shares.
      additionalPageAccess: string[];
      // Owner-configurable additive transaction grants (e.g.
      // "bookings.delete") layered on top of the role's own
      // canEditBookings/canDeleteBookings/isReadOnlyFinancials/
      // canEditHousekeeping checks — see hasActionAccess() in
      // src/lib/actionAccess.ts, the one resolver every route consults.
      additionalActionAccess: string[];
      impersonating?: boolean;
      impersonationSessionId?: string;
      impersonationStartedAt?: number;
      realUser?: RealUserSnapshot;
    };
    /** Only present as the payload of a client-triggered useSession().update()
     * call that's starting/stopping impersonation — never a real session field. */
    __impersonate?: { action: "start"; sessionId: string } | { action: "stop" };
  }
  interface User {
    id: string;
    name: string;
    username: string;
    email: string | null;
    role: Role;
    ownedUnitIds: string[];
    avatarColor: string;
    mustChangePassword: boolean;
    ownerId: string | null;
    isPlatformAdmin: boolean;
    additionalPageAccess: string[];
    additionalActionAccess: string[];
    ownerBusinessName: string | null;
    ownerLogoUrl: string | null;
    ownerEnabledModules: string[] | null;
    colorTheme: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: Role;
    ownedUnitIds: string[];
    avatarColor: string;
    mustChangePassword: boolean;
    ownerId: string | null;
    isPlatformAdmin: boolean;
    additionalPageAccess: string[];
    additionalActionAccess: string[];
    ownerBusinessName: string | null;
    ownerLogoUrl: string | null;
    ownerEnabledModules: string[] | null;
    colorTheme: string | null;
    impersonating?: boolean;
    impersonationSessionId?: string;
    impersonationStartedAt?: number;
    impersonationLastActivityAt?: number;
    realUser?: RealUserSnapshot;
    /** Epoch ms this token's role/ownerId/ownedUnitIds/isPlatformAdmin were
     * last re-checked against the database — see the throttled revalidation
     * in auth.ts's jwt() callback. */
    accountRevalidatedAt?: number;
  }
}
