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
 *
 * Airbnb-sourced bookings are the one deliberate exception: they never have
 * a bookerId (nobody "logged" them — see icalSync.ts), so the ownership
 * check above can never pass for them, and a Booker would otherwise be
 * permanently locked out of even fixing an Airbnb guest's check-in/check-out
 * time when Airbnb notifies of a schedule change — open to every Booker,
 * not scoped to whoever's "closest" to it, since there's no real owner to
 * scope to.
 */
export function canEditSpecificBooking(role: Role, bookingBookerId: string | null | undefined, ownEmployeeId: string | null | undefined, platform?: string) {
  if (!canEditBookings(role)) return false;
  if (role !== "BOOKER") return true;
  if (platform === "Airbnb") return true;
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

// Access Control Service (src/lib/access/service.ts) role gates.
/** Reveal/copy/send a booking's guest door code — same population as canEditBookings minus Housekeeping (no reason for cleaners to see a guest's self-check-in code). */
export function canRevealAccessCredential(role: Role) {
  return role === "OWNER_ADMIN" || role === "CO_OWNER" || role === "BOOKER";
}
/** Manually revoke a live credential — an escalation, not a normal booking edit. */
export function canRevokeAccessCredential(role: Role) {
  return role === "OWNER_ADMIN" || role === "CO_OWNER";
}
/** Trigger a standalone emergency unit code, outside the normal per-booking flow. */
export function canGrantEmergencyAccess(role: Role) {
  return role === "OWNER_ADMIN";
}
/** Read the access-credential audit trail. */
export function canViewAccessHistory(role: Role) {
  return role === "OWNER_ADMIN" || role === "CO_OWNER" || role === "AUDITOR";
}
/** Housekeeping Workforce Management, spec section 6: only Owner/Admin and
 * Booker may generate a housekeeper's temporary access code — explicitly
 * NOT Housekeeping/Maintenance/Inspector/Guest, and (per the same spec)
 * not CO_OWNER either, unlike the general canRevealAccessCredential gate. */
export function canGrantHousekeepingAccess(role: Role) {
  return role === "OWNER_ADMIN" || role === "BOOKER";
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
