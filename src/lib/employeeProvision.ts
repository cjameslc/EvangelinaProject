import { prisma } from "@/lib/prisma";
import { isPayrollRole } from "@/lib/payroll";

async function findOrCreateEmployee(user: { id: string; name: string; role: string; ownerId: string }) {
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
    return existing.id;
  }
  const created = await prisma.employee.create({
    data: { name: user.name, role: user.role, userId: user.id, ownerId: user.ownerId, salaryType: "MONTHLY", salaryRate: 0, monthlySalary: 0 },
  });
  return created.id;
}

/**
 * A User created (or role-changed) into a payroll-eligible role (Booker,
 * Housekeeping, Auditor) automatically gets a linked Employee record —
 * Admin's "Add/Edit user" is the single place staff accounts are created
 * now, so nobody has to remember a second step in My Earnings just to make
 * someone show up in the Booker/Cleaner menus and payroll. Salary starts at
 * ₱0/MONTHLY; the owner sets the real rate afterward via My Earnings ->
 * Owner Summary's Edit button.
 *
 * OWNER_ADMIN also gets one, even though it's not isPayrollRole() — the
 * Booker dropdown (BookingForm.tsx line ~749) lists OWNER_ADMIN as a
 * selectable booker, so an Owner-tier account needs the same resolvable
 * Employee identity a Booker gets, or the Booker field renders blank with
 * nothing to select. Confirmed as a real, recurring bug: Carl Ranido first,
 * then a brand-new user (Philip John Flores) hit the exact same thing days
 * later — both OWNER_ADMIN, both created with no linked Employee row. This
 * does NOT make OWNER_ADMIN a payroll role in any other sense —
 * computeTeamBreakdown, My Earnings' roster, and the Elite Booker
 * Challenge all filter by role explicitly (see isPayrollRole's own call
 * sites), so an Owner's Employee row stays invisible there, same as
 * before.
 */
export async function ensureEmployeeForUser(user: { id: string; name: string; role: string; ownerId: string | null }) {
  if ((!isPayrollRole(user.role) && user.role !== "OWNER_ADMIN") || !user.ownerId) return;
  await findOrCreateEmployee({ ...user, ownerId: user.ownerId });
}

/**
 * The OwnerAccess counterpart to ensureEmployeeForUser above, and the fix
 * for a real reported bug: Carl Ranido (OWNER_ADMIN, granted OwnerAccess to
 * The Felian) opened Bookings there and the Booker field was blank with
 * nothing to select — The Felian had ZERO Employee rows at all. Root cause:
 * granting OwnerAccess to a second property only ever created the access
 * grant itself, never a matching Employee row on that property — and
 * ensureEmployeeForUser above wouldn't have covered it anyway, being gated
 * to payroll-eligible roles only (Carl is OWNER_ADMIN) and called only at
 * user-create/role-change time in a user's *home* owner, never when a
 * second owner is granted later.
 *
 * No payroll-role gate here — unlike ensureEmployeeForUser, this exists so
 * ANY role (including Owner/Admin, who can now be selected as a booking's
 * booker — see BookingForm's bookerId select) has a resolvable Employee
 * identity the moment they gain access to a property, satisfying "the
 * booker is whoever logs in to the system" for every property they can
 * reach, not just their original one. Called from the owner-access grant
 * route for new grants going forward; existing grants need a one-time
 * backfill (see scratch/ convention) since this never ran for them.
 */
export async function ensureEmployeeForOwnerAccess(user: { id: string; name: string; role: string }, ownerId: string) {
  return findOrCreateEmployee({ ...user, ownerId });
}
