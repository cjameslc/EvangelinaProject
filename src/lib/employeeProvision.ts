import { prisma } from "@/lib/prisma";
import { isPayrollRole } from "@/lib/payroll";

/**
 * A User created (or role-changed) into a payroll-eligible role (Booker,
 * Housekeeping, Auditor) automatically gets a linked Employee record —
 * Admin's "Add/Edit user" is the single place staff accounts are created
 * now, so nobody has to remember a second step in My Earnings just to make
 * someone show up in the Booker/Cleaner menus and payroll. Salary starts at
 * ₱0/MONTHLY; the owner sets the real rate afterward via My Earnings ->
 * Owner Summary's Edit button.
 */
export async function ensureEmployeeForUser(user: { id: string; name: string; role: string; ownerId: string | null }) {
  if (!isPayrollRole(user.role)) return;
  const existing = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId } });
  if (existing) {
    // The actual bug this fixes: an Admin editing a User's role (e.g.
    // Booker -> Housekeeping) previously left the linked Employee row's
    // own `role` column stuck at whatever it was set to on first creation
    // — this function no-op'd once `existing` was found. That stale role
    // is what several real features actually key off (the Housekeeping
    // roster/clock-in filter in HousekeepingView.tsx, and the new
    // Housekeeping Workforce Management credential-generation check in
    // src/app/api/access/credential/housekeeping/route.ts both filter
    // Employee.role === "HOUSEKEEPING"), so a User promoted to
    // Housekeeping via Admin would silently never show up as one anywhere
    // that reads the Employee table, only where User.role is read
    // directly (session/RBAC). Sync role and name here too, not just on
    // first create.
    if (existing.role !== user.role || existing.name !== user.name) {
      await prisma.employee.update({ where: { id: existing.id }, data: { role: user.role, name: user.name } });
    }
    return;
  }
  await prisma.employee.create({
    data: { name: user.name, role: user.role, userId: user.id, ownerId: user.ownerId, salaryType: "MONTHLY", salaryRate: 0, monthlySalary: 0 },
  });
}
