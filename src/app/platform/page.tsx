import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PlatformView } from "@/components/platform/PlatformView";

/**
 * Platform Admin's own section (multi-owner brief, section 25/26) — kept
 * completely separate from /admin, which is Evangelina's *own* business
 * admin (Units/Staff/Settings for the owner James is signed in as). This
 * page is gated on isPlatformAdmin, not role — an OWNER_ADMIN at any other
 * owner never sees this, and James's own day-to-day /admin, /dashboard,
 * /bookings stay scoped to Evangelina exactly like today (see
 * src/lib/ownerScope.ts's doc comment on why isPlatformAdmin doesn't widen
 * those).
 */
export default async function PlatformPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isPlatformAdmin) redirect("/");

  const rawOwners = await prisma.owner.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { units: true, users: true } },
      users: { where: { role: "OWNER_ADMIN", active: true }, select: { username: true }, orderBy: { createdAt: "asc" } },
    },
  });
  // Same shaping as GET /api/platform/owners — PlatformView's Owner type
  // expects a flat adminUsernames: string[], not a nested users relation.
  const owners = rawOwners.map(({ users, ...o }) => ({ ...o, adminUsernames: users.map((u) => u.username) }));

  return <PlatformView owners={owners} />;
}
