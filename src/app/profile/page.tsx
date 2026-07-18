import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProfileView } from "@/components/profile/ProfileView";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    include: { ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } } },
  });
  if (!full) redirect("/login");

  const { passwordHash, ...safeUser } = full;

  return <ProfileView user={JSON.parse(JSON.stringify(safeUser))} />;
}
