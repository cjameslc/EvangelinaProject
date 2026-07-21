import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { GuestHomeView } from "@/components/guest/GuestHomeView";

export default async function Home() {
  const user = await getCurrentUser();
  // Staff redirect logic — unchanged from before this page had a guest half.
  if (user) {
    if (canSeeDashboard(user.role)) redirect("/dashboard");
    if (user.role === "AUDITOR") redirect("/auditor");
    redirect("/bookings");
  }

  // No staff session — this is a guest, render the public Airbnb-inspired
  // homepage instead of forcing a login (middleware.ts's authorized
  // callback special-cases "/" to make this reachable unauthenticated).
  const units = await prisma.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, shortName: true, unitNumber: true, location: true, nightlyRate: true, photoUrl: true, rating: true },
  });

  return <GuestHomeView units={JSON.parse(JSON.stringify(units))} />;
}
