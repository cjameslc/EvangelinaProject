import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
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

        const user = await prisma.user.findUnique({
          where: { username: credentials.username.toLowerCase().trim() },
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
      }
      // Lets the Profile page push name/email/avatar edits, and the forced
      // change-password screen clear its flag, into the live session (via
      // useSession().update()) without forcing a re-login.
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.avatarColor) token.avatarColor = session.avatarColor;
        if (session.mustChangePassword === false) token.mustChangePassword = false;
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
      return session;
    },
  },
};
