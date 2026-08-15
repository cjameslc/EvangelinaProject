import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EarningsView } from "@/components/earnings/EarningsView";

export default async function EarningsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdminViewer = user.role === "OWNER_ADMIN" || user.role === "CO_OWNER";
  const ownEmployee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true, name: true, role: true } });

  // Owners/Co-owners never have payroll of their own — they get the
  // admin/analytics view (leaderboard + pick-an-employee). Anyone else
  // without a linked, payroll-eligible Staff record has nothing to show.
  if (!isAdminViewer && (!ownEmployee || !["BOOKER", "HOUSEKEEPING", "AUDITOR"].includes(ownEmployee.role))) {
    redirect("/");
  }

  // ownerId scoping — this previously had none at all, meaning any
  // Owner/Co-owner's employee picker listed every Booker/Housekeeping/
  // Auditor across every tenant on the platform, not just their own staff.
  const employees = isAdminViewer
    ? await prisma.employee.findMany({ where: { active: true, ownerId: user.ownerId, role: { in: ["BOOKER", "HOUSEKEEPING", "AUDITOR"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } })
    : [];

  return (
    <EarningsView
      role={user.role}
      isAdminViewer={isAdminViewer}
      // An admin/co-owner may themselves have a linked Staff record (e.g.
      // the seed's original admin account), but it's never payroll-eligible
      // for them — default to the employee picker's list instead, not their
      // own non-payroll record.
      ownEmployeeId={isAdminViewer ? null : ownEmployee?.id ?? null}
      employees={employees}
    />
  );
}
