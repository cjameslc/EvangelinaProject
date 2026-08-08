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
    impersonating?: boolean;
    impersonationSessionId?: string;
    impersonationStartedAt?: number;
    impersonationLastActivityAt?: number;
    realUser?: RealUserSnapshot;
  }
}
