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
export async function ensureEmployeeForUser(user: { id: string; name: string; role: string }) {
  if (!isPayrollRole(user.role)) return;
  const existing = await prisma.employee.findUnique({ where: { userId: user.id } });
  if (existing) return;
  await prisma.employee.create({
    data: { name: user.name, role: user.role, userId: user.id, salaryType: "MONTHLY", salaryRate: 0, monthlySalary: 0 },
  });
}
