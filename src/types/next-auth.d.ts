import type { Role } from "@/lib/prisma-enums";
import "next-auth";
import "next-auth/jwt";

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
    };
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
  }
}
