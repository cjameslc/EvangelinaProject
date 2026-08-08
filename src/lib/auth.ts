import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";
import type { Role } from "@/lib/prisma-enums";

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
          include: { ownedUnits: { select: { unitId: true } } },
        });
        if (!user || !user.active) return null;

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

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role as Role,
          ownedUnitIds: user.ownedUnits.map((o) => o.unitId),
          avatarColor: user.avatarColor,
          mustChangePassword: user.mustChangePassword,
          ownerId: user.ownerId,
          isPlatformAdmin: user.isPlatformAdmin,
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
      }
      // Lets the Profile page push name/email/avatar edits, and the forced
      // change-password screen clear its flag, into the live session (via
      // useSession().update()) without forcing a re-login.
      if (trigger === "update" && session && !session.__impersonate) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.avatarColor) token.avatarColor = session.avatarColor;
        if (session.mustChangePassword === false) token.mustChangePassword = false;
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
            const target = await prisma.user.findUnique({ where: { id: record.targetUserId }, include: { ownedUnits: { select: { unitId: true } } } });
            if (target && target.active && target.role !== "OWNER_ADMIN") {
              token.realUser = {
                id: token.id, name: token.name as string, username: token.username, email: (token.email as string | undefined) ?? null,
                role: token.role, ownedUnitIds: token.ownedUnitIds, avatarColor: token.avatarColor, mustChangePassword: token.mustChangePassword,
                ownerId: token.ownerId, isPlatformAdmin: token.isPlatformAdmin,
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
          delete token.realUser;
          delete token.impersonating;
          delete token.impersonationSessionId;
          delete token.impersonationStartedAt;
          delete token.impersonationLastActivityAt;
        }
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
    // doesn't sit "active" forever in the log.
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
    },
  },
};
