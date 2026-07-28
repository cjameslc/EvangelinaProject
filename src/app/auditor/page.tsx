import { redirect } from "next/navigation";
import { getCurrentUser, unitIdWhere } from "@/lib/session";
import { canSeeAuditor } from "@/lib/rbac";
import { prismaPool } from "@/lib/prisma";
import { AuditorView } from "@/components/auditor/AuditorView";

export default async function AuditorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAuditor(user.role)) redirect("/");

  // Co-owners only see their own units here, same as everywhere else in the
  // app; Owner/Admin and Auditor keep the unrestricted view.
  const unitWhereClause = unitIdWhere(user);
  const unitFilter = (unitWhereClause as any).id;
  const findingsWhere = unitFilter ? { OR: [{ unitId: unitFilter }, { unitId: null }] } : {};

  // Separate pool clients, not the shared `prisma` singleton — the libSQL
  // adapter serializes every query on one client behind an internal mutex
  // (see prisma.ts), so these ran back-to-back over the network despite
  // the Promise.all wrapper. Matches the pattern already used in
  // bookings/page.tsx.
  const [units, employees, findings] = await Promise.all([
    prismaPool[0].unit.findMany({ where: unitWhereClause, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, shortName: true, unitNumber: true } }),
    prismaPool[1].employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    prismaPool[2].auditFinding.findMany({
      where: findingsWhere,
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
