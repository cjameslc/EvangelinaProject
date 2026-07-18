import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { CHECKLIST_GROUPS } from "@/lib/constants";
import { AdminView } from "@/components/admin/AdminView";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAdmin(user.role)) redirect("/");

  const [units, users, settings, loginLogs] = await Promise.all([
    prisma.unit.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { ownedUnits: { include: { unit: { select: { id: true, name: true, shortName: true } } } } } }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.auditLog.findMany({
      where: { action: "user.login" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    }),
  ]);

  const safeUsers = users.map(({ passwordHash, ...u }) => u);
  const safeSettings = { ...settings, checklistGroups: (settings.checklistGroups as typeof CHECKLIST_GROUPS | null) ?? CHECKLIST_GROUPS };

  return (
    <AdminView
      units={JSON.parse(JSON.stringify(units))}
      users={JSON.parse(JSON.stringify(safeUsers))}
      settings={JSON.parse(JSON.stringify(safeSettings))}
      loginLogs={JSON.parse(JSON.stringify(loginLogs))}
    />
  );
}
