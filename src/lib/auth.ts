import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { ownedUnits: { select: { unitId: true } } },
        });
        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        await logAudit(user.id, "user.login", "User", user.id, { email: user.email, role: user.role });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          ownedUnitIds: user.ownedUnits.map((o) => o.unitId),
          avatarColor: user.avatarColor,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.ownedUnitIds = user.ownedUnitIds;
        token.avatarColor = user.avatarColor;
      }
      // Lets the Profile page push name/email/avatar edits into the live
      // session (via useSession().update()) without forcing a re-login.
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.avatarColor) token.avatarColor = session.avatarColor;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.name = token.name as string;
      session.user.email = token.email as string;
      session.user.role = token.role;
      session.user.ownedUnitIds = token.ownedUnitIds;
      session.user.avatarColor = token.avatarColor;
      return session;
    },
  },
};
