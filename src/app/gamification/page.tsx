import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { GamificationView } from "@/components/gamification/GamificationView";

export default async function GamificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ownEmployee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true } });

  return <GamificationView role={user.role} ownEmployeeId={ownEmployee?.id ?? null} />;
}
