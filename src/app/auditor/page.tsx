import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeAuditor } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { AuditorView } from "@/components/auditor/AuditorView";

export default async function AuditorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAuditor(user.role)) redirect("/");

  const [units, employees, findings] = await Promise.all([
    prisma.unit.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, shortName: true, unitNumber: true } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    prisma.auditFinding.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
        employee: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  return (
    <AuditorView
      units={JSON.parse(JSON.stringify(units))}
      employees={JSON.parse(JSON.stringify(employees))}
      initialFindings={JSON.parse(JSON.stringify(findings))}
    />
  );
}
