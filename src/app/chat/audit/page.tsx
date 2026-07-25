import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { conversationStats } from "@/lib/chat/audit";
import { AuditView } from "@/components/chat/AuditView";

export default async function ChatAuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER_ADMIN") redirect("/chat");

  const [stats, users] = await Promise.all([
    conversationStats(),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return <AuditView initialStats={stats} users={JSON.parse(JSON.stringify(users))} />;
}
