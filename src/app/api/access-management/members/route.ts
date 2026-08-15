import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { GRANTABLE_PAGES } from "@/lib/pageAccess";
import { GRANTABLE_ACTIONS } from "@/lib/actionAccess";
import { NAV_ITEMS } from "@/lib/constants";

/**
 * Owner-only directory for Settings > Access Management > Members &
 * Permissions — every member on this owner's tenant (same `ownerId` scoping
 * every other admin list already uses, see /api/users), each with their
 * role's own default pages (from NAV_ITEMS, computed here so the client
 * doesn't need its own copy of that logic) and any additional pages an
 * Owner has granted on top.
 */
export async function GET() {
  const { user: actor, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { ownerId: actor.ownerId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, username: true, role: true, active: true,
      additionalPageAccess: { select: { page: true, createdAt: true } },
      additionalActionAccess: { select: { action: true, createdAt: true } },
    },
  });

  const members = users.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active,
    rolePages: u.role === "OWNER_ADMIN" ? NAV_ITEMS.map((i) => i.href) : NAV_ITEMS.filter((i) => i.roles.includes(u.role)).map((i) => i.href),
    additionalPages: u.additionalPageAccess.map((a) => a.page),
    roleActions: u.role === "OWNER_ADMIN"
      ? GRANTABLE_ACTIONS.map((a) => a.key)
      : GRANTABLE_ACTIONS.filter((a) => a.roleDefault(u.role as any)).map((a) => a.key),
    additionalActions: u.additionalActionAccess.map((a) => a.action),
    lastUpdated: [...u.additionalPageAccess, ...u.additionalActionAccess].reduce<string | null>((latest, a) => {
      const iso = a.createdAt.toISOString();
      return !latest || iso > latest ? iso : latest;
    }, null),
  }));

  // GRANTABLE_ACTIONS entries carry a `roleDefault` function — not
  // serializable, and not something the client needs (roleActions above
  // already resolved it per member). Send just the display shape.
  const grantableActions = GRANTABLE_ACTIONS.map((a) => ({ key: a.key, label: a.label, page: a.page }));

  return NextResponse.json({ members, grantablePages: GRANTABLE_PAGES, navItems: NAV_ITEMS, grantableActions });
}
