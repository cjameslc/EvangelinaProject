import type { Role } from "@/lib/prisma-enums";

export function canSeeDashboard(role: Role) {
  return role === "OWNER_ADMIN" || role === "CO_OWNER";
}
export function canSeeAnalytics(role: Role) {
  return role === "OWNER_ADMIN" || role === "CO_OWNER";
}
export function canSeeAdmin(role: Role) {
  return role === "OWNER_ADMIN";
}
export function canSeeAuditor(role: Role) {
  return role === "OWNER_ADMIN" || role === "AUDITOR" || role === "CO_OWNER";
}
export function canSeeHousekeeping(role: Role) {
  return role === "OWNER_ADMIN" || role === "CO_OWNER" || role === "HOUSEKEEPING";
}
export function canSeeBookings(role: Role) {
  return role !== "AUDITOR";
}
// Social Media Center — open to every staff role.
export function canSeeSocialMedia(_role: Role) {
  return true;
}
export function canManageUnits(role: Role) {
  return role === "OWNER_ADMIN";
}
export function canEditBookings(role: Role) {
  return role === "OWNER_ADMIN" || role === "CO_OWNER" || role === "BOOKER" || role === "HOUSEKEEPING";
}
/**
 * canEditBookings() says a Booker may edit/delete bookings at all — this is
 * the per-row narrowing on top of that: a Booker may only touch the specific
 * booking they themselves logged (Booking.bookerId), not a peer's. Every
 * other role canEditBookings() already covers (Owner/Admin, Co-owner,
 * Housekeeping) keeps full access, unrestricted by who logged it.
 */
export function canEditSpecificBooking(role: Role, bookingBookerId: string | null | undefined, ownEmployeeId: string | null | undefined) {
  if (!canEditBookings(role)) return false;
  if (role !== "BOOKER") return true;
  return !!ownEmployeeId && bookingBookerId === ownEmployeeId;
}
/**
 * Hard-deleting a booking permanently destroys its record (payment history,
 * commission trail) — a Booker may cancel a booking they own (with a
 * required reason, via POST /api/bookings/[id]/cancel), but only
 * Owner/Admin, Co-owner, and Housekeeping may actually delete the row.
 */
export function canDeleteBookings(role: Role) {
  return canEditBookings(role) && role !== "BOOKER";
}
export function canEditHousekeeping(role: Role) {
  return role === "OWNER_ADMIN" || role === "HOUSEKEEPING";
}
/** Narrower than canEditHousekeeping: Housekeeping can adjust an existing supply's count (and used to be able to add/remove new supply items entirely), but adding brand-new stock items is now Admin-only — new items get added centrally via Admin > Supplies. */
export function canAddHousekeepingStock(role: Role) {
  return role === "OWNER_ADMIN";
}
/** Auditor + Housekeeping never write financial records — read-only there. */
export function isReadOnlyFinancials(role: Role) {
  return role === "AUDITOR" || role === "HOUSEKEEPING";
}

/**
 * Given a role and the list of unitIds a CO_OWNER is assigned to,
 * returns either "all" (no filtering needed) or the explicit unitId list
 * to filter Prisma queries by.
 */
export function unitScope(role: Role, ownedUnitIds: string[]): "all" | string[] {
  if (role === "CO_OWNER") return ownedUnitIds;
  return "all";
}
