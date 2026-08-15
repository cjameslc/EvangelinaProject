import type { Role } from "@/lib/prisma-enums";
import { canEditBookings, canDeleteBookings, isReadOnlyFinancials, canEditHousekeeping } from "@/lib/rbac";

/**
 * The layer below page access: individual transactions a page's own
 * role-based checks already gate one at a time. Each entry's `roleDefault`
 * is the *actual* existing rbac.ts function for that transaction — this
 * registry doesn't invent a parallel permission model, it just makes the
 * existing one additionally grantable per member. Scoped to the two pages
 * that already have real, distinct transaction-level checks in rbac.ts
 * (Bookings, Housekeeping); Dashboard/Analytics/Auditor/Calendar are
 * view-only today with no separate create/edit/delete concept to grant.
 */
export const GRANTABLE_ACTIONS = [
  { key: "bookings.create", label: "Create booking", page: "/bookings", roleDefault: (role: Role) => canEditBookings(role) },
  { key: "bookings.edit", label: "Edit booking (dates, guest, notes, status)", page: "/bookings", roleDefault: (role: Role) => canEditBookings(role) },
  { key: "bookings.delete", label: "Delete booking", page: "/bookings", roleDefault: (role: Role) => canDeleteBookings(role) },
  { key: "bookings.financial", label: "Edit payment fields (amount, paid, discounts)", page: "/bookings", roleDefault: (role: Role) => !isReadOnlyFinancials(role) },
  { key: "housekeeping.edit", label: "Edit housekeeping (checklist, status, supplies, bills)", page: "/housekeeping", roleDefault: (role: Role) => canEditHousekeeping(role) },
  { key: "housekeeping.financial", label: "Record laundry payments", page: "/housekeeping", roleDefault: (role: Role) => canEditHousekeeping(role) && !isReadOnlyFinancials(role) },
] as const;

export type ActionKey = (typeof GRANTABLE_ACTIONS)[number]["key"];

export function isGrantableAction(action: string): action is ActionKey {
  return (GRANTABLE_ACTIONS as readonly { key: string }[]).some((a) => a.key === action);
}

/**
 * The one place "can this member actually do X" gets computed for a
 * transaction-level action — API routes call this instead of calling
 * canEditBookings/canDeleteBookings/isReadOnlyFinancials/canEditHousekeeping
 * directly, so an Owner's per-member grant takes effect exactly where the
 * role check used to be, with the role's own default preserved as the
 * floor (OWNER_ADMIN always true, matching effectivePageAccess).
 */
export function hasActionAccess(action: ActionKey, role: Role | string | undefined, additionalActions: string[]): boolean {
  if (role === "OWNER_ADMIN") return true;
  const def = GRANTABLE_ACTIONS.find((a) => a.key === action);
  if (!def) return false;
  if (role && def.roleDefault(role as Role)) return true;
  return additionalActions.includes(action);
}
