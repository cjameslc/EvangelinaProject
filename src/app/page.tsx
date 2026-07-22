import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getViewMode } from "@/lib/viewMode";
import { GuestHomeView } from "@/components/guest/GuestHomeView";

export default async function Home() {
  const user = await getCurrentUser();
  // Staff redirect logic — unchanged, UNLESS this employee has switched to
  // Travel Mode (Navbar's mode toggle), in which case they fall through to
  // the same guest homepage below instead of being bounced to their staff
  // page. Their staff session/access is untouched either way — this only
  // changes what "/" renders for them, not what they're allowed to reach.
  if (user && getViewMode() === "staff") {
    if (canSeeDashboard(user.role)) redirect("/dashboard");
    if (user.role === "AUDITOR") redirect("/auditor");
    redirect("/bookings");
  }

  // No staff session (or a staff session in Travel Mode) — render the
  // public Airbnb-inspired homepage instead of forcing a login
  // (middleware.ts's authorized callback special-cases "/" to make this
  // reachable unauthenticated).
  const units = await prisma.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, shortName: true, unitNumber: true, location: true, nightlyRate: true, photoUrl: true, rating: true },
  });

  return <GuestHomeView units={JSON.parse(JSON.stringify(units))} />;
}
