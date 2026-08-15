import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";
import type { Role } from "@/lib/prisma-enums";

// Owner.enabledModules is stored as a JSON array (or null for unrestricted)
// — every read site needs the same parse, so it lives here once rather
// than duplicated at each of the 4 places below that select owner.enabledModules.
function parseEnabledModules(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // Staff login had no rate limit at all — every other credential-
        // checking endpoint in this app (guest booking-ID login, wifi/door-
        // code reveal) already has one. Keyed on the attempted username
        // (not IP — NextAuth's authorize() doesn't reliably expose one),
        // which directly stops repeated password-guessing against a single
        // account regardless of where the requests come from.
        const normalizedUsername = credentials.username.toLowerCase().trim();
        const limited = rateLimit(`staff-login:${normalizedUsername}`, 10, 15 * 60 * 1000);
        if (!limited.ok) return null;

        const user = await prisma.user.findUnique({
          where: { username: normalizedUsername },
          include: {
            additionalPageAccess: { select: { page: true } }, additionalActionAccess: { select: { action: true } },
            owner: { select: { businessName: true, logoUrl: true, enabledModules: true, status: true } },
          },
        });
        if (!user || !user.active) return null;
        // Owner.status was a real field with no actual enforcement anywhere
        // until now — a Platform Admin toggling "Suspended" (see PATCH
        // /api/platform/owners/[id]) had zero effect. This blocks new
        // sign-ins for that tenant's staff, matching the field's own schema
        // doc comment. Deliberately doesn't force out an already-active
        // session (would need a per-request Owner lookup in middleware,
        // which this app's edge-cached design specifically avoids — see
        // isMaintenanceActive's own comment) — a suspended tenant's staff
        // stay signed out from their NEXT login attempt, not mid-session.
        if (user.owner?.status === "SUSPENDED") return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Login logs are for auditing distinct sign-in events, not every
        // token refresh/re-auth a flaky connection or multiple open tabs
        // can trigger — skip logging if this account already has one within
        // the last 30 minutes, so the list doesn't fill up with near-dupes.
        const recentLogin = await prisma.auditLog.findFirst({
          where: { actorUserId: user.id, action: "user.login", createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
          select: { id: true },
        });
        if (!recentLogin) {
          await logAudit(user.id, "user.login", "User", user.id, { username: user.username, role: user.role });
        }

        // Multi-staycation switcher — resume wherever this person was last
        // viewing (see StaycationSwitcher.tsx / OwnerAccess) rather than
        // always dropping them back on their home property. Only applies
        // when it's genuinely still valid (grant not revoked, owner not
        // suspended since they last switched) — otherwise this silently
        // falls through to the home ownerId/role exactly as before the
        // switcher existed, same fail-safe the mid-session paths use.
        let active = {
          ownerId: user.ownerId, role: user.role as Role,
          businessName: user.owner?.businessName ?? null, logoUrl: user.owner?.logoUrl ?? null, enabledModules: user.owner?.enabledModules ?? null,
        };
        if (user.lastActiveOwnerId && user.lastActiveOwnerId !== user.ownerId) {
          const lastAccess = await prisma.ownerAccess.findUnique({
            where: { userId_ownerId: { userId: user.id, ownerId: user.lastActiveOwnerId } },
            select: { role: true, owner: { select: { id: true, businessName: true, logoUrl: true, enabledModules: true, status: true } } },
          });
          if (lastAccess && lastAccess.owner.status === "ACTIVE") {
            active = {
              ownerId: lastAccess.owner.id, role: lastAccess.role as Role,
              businessName: lastAccess.owner.businessName, logoUrl: lastAccess.owner.logoUrl, enabledModules: lastAccess.owner.enabledModules,
            };
          }
        }
        const ownedUnits = active.ownerId
          ? await prisma.unitOwner.findMany({ where: { userId: user.id, unit: { ownerId: active.ownerId } }, select: { unitId: true } })
          : [];

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: active.role,
          ownedUnitIds: ownedUnits.map((o) => o.unitId),
          avatarColor: user.avatarColor,
          mustChangePassword: user.mustChangePassword,
          ownerId: active.ownerId,
          isPlatformAdmin: user.isPlatformAdmin,
          additionalPageAccess: user.additionalPageAccess.map((a) => a.page),
          additionalActionAccess: user.additionalActionAccess.map((a) => a.action),
          ownerBusinessName: active.businessName,
          ownerLogoUrl: active.logoUrl,
          ownerEnabledModules: parseEnabledModules(active.enabledModules),
          colorTheme: user.colorTheme,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.ownedUnitIds = user.ownedUnitIds;
        token.avatarColor = user.avatarColor;
        token.mustChangePassword = user.mustChangePassword;
        token.name = user.name;
        token.email = user.email ?? undefined;
        token.ownerId = user.ownerId;
        token.isPlatformAdmin = user.isPlatformAdmin;
        token.additionalPageAccess = user.additionalPageAccess;
        token.additionalActionAccess = user.additionalActionAccess;
        token.ownerBusinessName = user.ownerBusinessName;
        token.ownerLogoUrl = user.ownerLogoUrl;
        token.ownerEnabledModules = user.ownerEnabledModules;
        token.colorTheme = user.colorTheme;
        token.accountRevalidatedAt = Date.now();
      }
      // Lets the Profile page push name/email/avatar/color-theme edits, the
      // forced change-password screen clear its flag, and Admin -> Settings
      // -> Staycation Profile push a fresh business name/icon, into the live
      // session (via useSession().update()) without forcing a re-login.
      if (trigger === "update" && session && !session.__impersonate) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.avatarColor) token.avatarColor = session.avatarColor;
        if (session.mustChangePassword === false) token.mustChangePassword = false;
        if ("ownerBusinessName" in session) token.ownerBusinessName = session.ownerBusinessName;
        if ("ownerLogoUrl" in session) token.ownerLogoUrl = session.ownerLogoUrl;
        if ("colorTheme" in session) token.colorTheme = session.colorTheme;
      }

      // Admin impersonation: the client triggers these via
      // useSession().update({ __impersonate: { action, ... } }) — see
      // src/lib/impersonation.ts. Everything here is re-validated
      // server-side (never trust the client payload beyond an id to look
      // up), and the swap lives entirely inside this one signed cookie —
      // logging out or letting the cookie expire ends impersonation for
      // free, no separate cleanup needed for those two cases.
      if (trigger === "update" && session?.__impersonate?.action === "start") {
        const { sessionId } = session.__impersonate;
        if (!token.impersonating && sessionId) {
          const record = await prisma.impersonationSession.findUnique({ where: { id: sessionId } });
          if (record && record.adminUserId === token.id && !record.endedAt) {
            const target = await prisma.user.findUnique({ where: { id: record.targetUserId }, include: { ownedUnits: { select: { unitId: true } }, additionalPageAccess: { select: { page: true } }, additionalActionAccess: { select: { action: true } }, owner: { select: { businessName: true, logoUrl: true, enabledModules: true } } } });
            if (target && target.active && target.role !== "OWNER_ADMIN") {
              token.realUser = {
                id: token.id, name: token.name as string, username: token.username, email: (token.email as string | undefined) ?? null,
                role: token.role, ownedUnitIds: token.ownedUnitIds, avatarColor: token.avatarColor, mustChangePassword: token.mustChangePassword,
                ownerId: token.ownerId, isPlatformAdmin: token.isPlatformAdmin, additionalPageAccess: token.additionalPageAccess,
                additionalActionAccess: token.additionalActionAccess, ownerBusinessName: token.ownerBusinessName, ownerLogoUrl: token.ownerLogoUrl,
                ownerEnabledModules: token.ownerEnabledModules, colorTheme: token.colorTheme,
              };
              token.id = target.id;
              token.name = target.name;
              token.username = target.username;
              token.email = target.email;
              token.role = target.role as Role;
              token.ownedUnitIds = target.ownedUnits.map((o) => o.unitId);
              token.avatarColor = target.avatarColor;
              token.mustChangePassword = false; // never force the impersonated view into the change-password screen
              // Impersonation means experiencing exactly what the target
              // sees — their owner's tenant scope, not the real admin's.
              // isPlatformAdmin naturally comes through false here: the
              // guard just above already forbids impersonating another
              // OWNER_ADMIN, and platform admins are OWNER_ADMINs.
              token.ownerId = target.ownerId;
              token.isPlatformAdmin = target.isPlatformAdmin;
              token.additionalPageAccess = target.additionalPageAccess.map((a) => a.page);
              token.additionalActionAccess = target.additionalActionAccess.map((a) => a.action);
              token.ownerBusinessName = target.owner?.businessName ?? null;
              token.ownerLogoUrl = target.owner?.logoUrl ?? null;
              token.ownerEnabledModules = parseEnabledModules(target.owner?.enabledModules);
              // Impersonation shows the target's own personal theme too —
              // same "experiencing exactly what they see" principle as
              // everything else swapped here.
              token.colorTheme = target.colorTheme;
              token.impersonating = true;
              token.impersonationSessionId = sessionId;
              token.impersonationStartedAt = Date.now();
              token.impersonationLastActivityAt = Date.now();
            }
          }
        }
      }
      if (trigger === "update" && session?.__impersonate?.action === "stop") {
        if (token.impersonating && token.realUser) {
          await prisma.impersonationSession.updateMany({
            where: { id: token.impersonationSessionId, endedAt: null },
            data: {
              endedAt: new Date(),
              durationSeconds: token.impersonationStartedAt ? Math.round((Date.now() - token.impersonationStartedAt) / 1000) : null,
              endReason: "manual",
            },
          }).catch(() => {});
          const real = token.realUser;
          token.id = real.id;
          token.name = real.name;
          token.username = real.username;
          token.email = real.email ?? undefined;
          token.role = real.role;
          token.ownedUnitIds = real.ownedUnitIds;
          token.avatarColor = real.avatarColor;
          token.mustChangePassword = real.mustChangePassword;
          token.ownerId = real.ownerId;
          token.isPlatformAdmin = real.isPlatformAdmin;
          token.additionalPageAccess = real.additionalPageAccess;
          token.additionalActionAccess = real.additionalActionAccess;
          token.ownerBusinessName = real.ownerBusinessName;
          token.ownerLogoUrl = real.ownerLogoUrl;
          token.ownerEnabledModules = real.ownerEnabledModules;
          token.colorTheme = real.colorTheme;
          delete token.realUser;
          delete token.impersonating;
          delete token.impersonationSessionId;
          delete token.impersonationStartedAt;
          delete token.impersonationLastActivityAt;
        }
      }

      // Multi-staycation switcher — same shape as the impersonation swap
      // above (client triggers via useSession().update({ __switchOwner }),
      // see src/lib/staycationSwitch.ts), but there's no "real" identity to
      // snapshot/restore: the logged-in person IS the same person, just
      // viewing a different property. Re-validated server-side against
      // OwnerAccess on every switch (never trust the client payload beyond
      // the target ownerId to look up) — the API route (POST
      // /api/staycations/switch) validates too, but that's a courtesy for a
      // clean error message; this check is the one that actually matters.
      // Allowed while impersonating: token.id is already the impersonated
      // target's id at this point (swapped above), so this looks up and
      // applies to *their* OwnerAccess grants, switching the impersonated
      // view — consistent with "impersonation means experiencing exactly
      // what the target sees" applied to a second property they can reach.
      // Never touches token.realUser, so stopping impersonation still
      // restores the real admin's own original property untouched.
      if (trigger === "update" && session?.__switchOwner?.ownerId) {
        const targetOwnerId = session.__switchOwner.ownerId as string;
        const access = await prisma.ownerAccess.findUnique({
          where: { userId_ownerId: { userId: token.id, ownerId: targetOwnerId } },
          select: { role: true, owner: { select: { id: true, businessName: true, logoUrl: true, enabledModules: true, status: true } } },
        });
        if (access && access.owner.status === "ACTIVE") {
          const ownedUnits = await prisma.unitOwner.findMany({ where: { userId: token.id, unit: { ownerId: access.owner.id } }, select: { unitId: true } });
          token.ownerId = access.owner.id;
          token.role = access.role as Role;
          token.ownedUnitIds = ownedUnits.map((o) => o.unitId);
          token.ownerBusinessName = access.owner.businessName;
          token.ownerLogoUrl = access.owner.logoUrl;
          token.ownerEnabledModules = parseEnabledModules(access.owner.enabledModules);
          // Skipped while impersonating — this is the admin briefly looking
          // through the target's eyes, not a real preference of theirs;
          // persisting it would silently change which property the target
          // actually resumes on next time *they* log in for real.
          if (!token.impersonating) {
            await prisma.user.update({ where: { id: token.id }, data: { lastActiveOwnerId: access.owner.id } }).catch(() => {});
          }
          // Skip the revalidation block below for this same request — it
          // would otherwise immediately re-derive these exact fields a
          // second time from scratch the instant the 60s throttle happens
          // to be stale, which is harmless but wasteful on the one request
          // that just did the real work.
          token.accountRevalidatedAt = Date.now();
        }
      }

      // Keep a long-lived JWT session in sync with the database for the
      // handful of fields that can change out from under it — role,
      // ownerId, ownedUnitIds, isPlatformAdmin. Without this, an admin
      // fixing a broken account (e.g. a user row missing ownerId — this
      // happened for real and made every booking save fail with no
      // obvious cause) or changing someone's role has no effect until
      // that person's existing session cookie happens to expire or they
      // manually log out, since the JWT strategy otherwise just carries
      // forward whatever authorize() returned at original sign-in.
      // Throttled to once a minute per session (not every request) to
      // keep this cheap; skipped while impersonating, since that token
      // intentionally holds the target's snapshot from when impersonation
      // started, not a live view of the admin's own account.
      //
      // role/ownerId/ownedUnitIds/ownerBusinessName/ownerLogoUrl/
      // ownerEnabledModules are no longer read directly off the User row
      // here — the multi-staycation switcher means the *active* owner
      // (token.ownerId) can legitimately differ from the user's home
      // owner (fresh.ownerId) for the rest of a long session, and each
      // property can carry its own role (see OwnerAccess). This re-derives
      // those fields from whichever OwnerAccess row matches the currently
      // active owner instead — which is also what makes access revocation
      // or an owner being suspended take effect within 60 seconds, for
      // free, on this same throttle: if that row (or its Owner) no longer
      // checks out, this falls back to the user's real home owner exactly
      // as if they'd never switched.
      if (!token.impersonating && (!token.accountRevalidatedAt || Date.now() - token.accountRevalidatedAt > 60_000)) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: {
            ownerId: true, isPlatformAdmin: true,
            additionalPageAccess: { select: { page: true } }, additionalActionAccess: { select: { action: true } },
            colorTheme: true,
          },
        });
        if (fresh) {
          token.isPlatformAdmin = fresh.isPlatformAdmin;
          token.additionalPageAccess = fresh.additionalPageAccess.map((a) => a.page);
          token.additionalActionAccess = fresh.additionalActionAccess.map((a) => a.action);
          token.colorTheme = fresh.colorTheme;

          const activeOwnerId = (token.ownerId as string | null) ?? fresh.ownerId;
          let access = activeOwnerId
            ? await prisma.ownerAccess.findUnique({
                where: { userId_ownerId: { userId: token.id, ownerId: activeOwnerId } },
                select: { role: true, owner: { select: { id: true, businessName: true, logoUrl: true, enabledModules: true, status: true } } },
              })
            : null;
          if ((!access || access.owner.status !== "ACTIVE") && fresh.ownerId && fresh.ownerId !== activeOwnerId) {
            access = await prisma.ownerAccess.findUnique({
              where: { userId_ownerId: { userId: token.id, ownerId: fresh.ownerId } },
              select: { role: true, owner: { select: { id: true, businessName: true, logoUrl: true, enabledModules: true, status: true } } },
            });
          }
          if (access && access.owner.status === "ACTIVE") {
            const ownedUnits = await prisma.unitOwner.findMany({ where: { userId: token.id, unit: { ownerId: access.owner.id } }, select: { unitId: true } });
            token.ownerId = access.owner.id;
            token.role = access.role as Role;
            token.ownedUnitIds = ownedUnits.map((o) => o.unitId);
            token.ownerBusinessName = access.owner.businessName;
            token.ownerLogoUrl = access.owner.logoUrl;
            token.ownerEnabledModules = parseEnabledModules(access.owner.enabledModules);
          } else {
            // No valid OwnerAccess at all (shouldn't normally happen —
            // every user is backfilled one home row) — fail safe to
            // whatever the User row itself says directly, same as this
            // block's behavior before the switcher existed.
            const rawUser = await prisma.user.findUnique({ where: { id: token.id }, select: { role: true, ownerId: true } });
            token.ownerId = rawUser?.ownerId ?? null;
            token.role = (rawUser?.role as Role) ?? token.role;
            token.ownedUnitIds = [];
            token.ownerBusinessName = null;
            token.ownerLogoUrl = null;
            token.ownerEnabledModules = null;
          }
        }
        token.accountRevalidatedAt = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.name = token.name as string;
      session.user.username = token.username;
      session.user.email = (token.email as string | undefined) ?? null;
      session.user.role = token.role;
      session.user.ownedUnitIds = token.ownedUnitIds;
      session.user.avatarColor = token.avatarColor;
      session.user.mustChangePassword = token.mustChangePassword;
      session.user.ownerId = token.ownerId;
      session.user.isPlatformAdmin = token.isPlatformAdmin;
      session.user.additionalPageAccess = token.additionalPageAccess ?? [];
      session.user.additionalActionAccess = token.additionalActionAccess ?? [];
      session.user.ownerBusinessName = token.ownerBusinessName ?? null;
      session.user.ownerLogoUrl = token.ownerLogoUrl ?? null;
      session.user.ownerEnabledModules = token.ownerEnabledModules ?? null;
      session.user.colorTheme = token.colorTheme ?? null;
      if (token.impersonating) {
        session.user.impersonating = true;
        session.user.impersonationSessionId = token.impersonationSessionId;
        session.user.impersonationStartedAt = token.impersonationStartedAt;
        session.user.realUser = token.realUser;
      }
      return session;
    },
  },
  events: {
    // Covers the "admin logs out while impersonating" case — impersonation
    // otherwise ends implicitly with the cookie for a normal logout, but
    // the ImpersonationSession audit row still needs an endedAt so it
    // doesn't sit "active" forever in the log. Also the one place a real
    // "user.logout" audit entry can be written at all — signOut() is a
    // client-side-only NextAuth call with no API route of its own to hook
    // logAudit into otherwise; login already has its own real audit entry
    // (user.login in this same file's authorize()), logout previously had
    // none anywhere for any role except Housekeeping's unrelated shift
    // clock-out ("shift.clockout").
    async signOut({ token }) {
      if (token?.impersonating && token.impersonationSessionId) {
        await prisma.impersonationSession.updateMany({
          where: { id: token.impersonationSessionId, endedAt: null },
          data: {
            endedAt: new Date(),
            durationSeconds: token.impersonationStartedAt ? Math.round((Date.now() - token.impersonationStartedAt) / 1000) : null,
            endReason: "admin_logout",
          },
        }).catch(() => {});
      }
      if (token?.id) {
        await logAudit(token.id, "user.logout", "User", token.id).catch(() => {});
      }
    },
  },
};
