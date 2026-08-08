import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unitScope } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

// Re-exported so existing `import { logAudit } from "@/lib/session"` call
// sites keep working. Lives in its own module (not here) because auth.ts
// needs to log the login event on every successful sign-in, and auth.ts is
// itself imported by this file — a direct import here would be circular.
export { logAudit } from "@/lib/audit";

/** Server-side helper: current session user, or null if unauthenticated. */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Throws-free guard for API routes.
 * Always returns both keys so `const { user, error } = await requireUser()`
 * type-narrows correctly: once `if (error) return error;` has run, `user`
 * is guaranteed non-undefined.
 */
export async function requireUser(
  allowedRoles?: string[]
): Promise<{ user: SessionUser; error: undefined } | { user: undefined; error: Response }> {
  const user = await getCurrentUser();
  if (!user) return { user: undefined, error: new Response("Unauthorized", { status: 401 }) };
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return { user: undefined, error: new Response("Forbidden", { status: 403 }) };
  }
  return { user, error: undefined };
}

type OwnerScopedUser = { role: string; ownedUnitIds: string[]; ownerId: string | null };

/** Prisma `where` fragment scoping a unit-bearing query to what this user may see.
 *
 * Folds in the multi-owner tenant boundary (see src/lib/ownerScope.ts) on
 * top of the pre-existing CO_OWNER unit-subset scoping — every page that
 * already calls this (Bookings, Calendar, Housekeeping, and most of
 * Dashboard) gets owner isolation for free, without touching each query
 * site individually. `unit: { ownerId }` rather than a denormalized
 * column, matching how Booking/CalendarBlock/HousekeepingUnitState/Stock/
 * Bill/CleaningLog all already carry a required `unit` relation. */
export function unitWhere(user: OwnerScopedUser) {
  const scope = unitScope(user.role as any, user.ownedUnitIds);
  const ownerFilter = { unit: { ownerId: user.ownerId } };
  return scope === "all" ? ownerFilter : { unitId: { in: scope }, ...ownerFilter };
}

/** Same as {@link unitWhere}, but for querying the Unit model itself (keyed by `id`, not `unitId`). */
export function unitIdWhere(user: OwnerScopedUser) {
  const scope = unitScope(user.role as any, user.ownedUnitIds);
  const ownerFilter = { ownerId: user.ownerId };
  return scope === "all" ? ownerFilter : { id: { in: scope }, ...ownerFilter };
}

/**
 * Write-path guard: is this specific unit inside what the user may touch?
 * `unitWhere`/`unitIdWhere` filter list queries so a Co-owner only ever
 * *sees* their own units — but that filter does nothing on a mutation
 * targeting one exact unitId (create a booking/calendar block for it, or
 * edit/delete an existing row that belongs to it), since there's no list to
 * filter. Every write route that accepts a unitId, or looks one up off an
 * existing row before mutating it, must check this explicitly.
 *
 * Async, unlike the old in-memory-only version — the CO_OWNER unit-subset
 * check stays a cheap array lookup, but the tenant boundary (see
 * src/lib/ownerScope.ts) can only be verified against the unit's real
 * ownerId, which means one lookup. Without this, "all" (what every
 * OWNER_ADMIN's role resolves to) meant literally every unit across every
 * owner was writable by unitId alone — the read-side equivalent of this
 * exact gap was a live, confirmed leak (see the Analytics
 * effectiveUnitIds() fix); this is the same class of bug on the write
 * path, closed the same way rather than left for someone to find by
 * crafting a request.
 */
export async function isUnitInScope(user: OwnerScopedUser, unitId: string | null | undefined): Promise<boolean> {
  if (!unitId) return false;
  const scope = unitScope(user.role as any, user.ownedUnitIds);
  if (scope !== "all" && !scope.includes(unitId)) return false;
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { ownerId: true } });
  return !!unit && unit.ownerId === user.ownerId;
}

/**
 * Dashboard-only scoping: unlike {@link unitWhere}, an Owner/Admin with units
 * explicitly assigned to them sees only their own portfolio here — their
 * unrestricted "all" access on every other page (Bookings, Calendar,
 * Housekeeping, Admin, Auditor) is untouched. An Owner/Admin with nothing
 * explicitly assigned still falls back to "all", so a fresh admin account
 * isn't left staring at an empty dashboard. Co-owners behave exactly as
 * {@link unitWhere} already does — unchanged.
 */
export function dashboardUnitWhere(user: OwnerScopedUser) {
  const ownerFilter = { unit: { ownerId: user.ownerId } };
  if (user.role === "OWNER_ADMIN") return user.ownedUnitIds.length ? { unitId: { in: user.ownedUnitIds }, ...ownerFilter } : ownerFilter;
  return unitWhere(user);
}
export function dashboardUnitIdWhere(user: OwnerScopedUser) {
  const ownerFilter = { ownerId: user.ownerId };
  if (user.role === "OWNER_ADMIN") return user.ownedUnitIds.length ? { id: { in: user.ownedUnitIds }, ...ownerFilter } : ownerFilter;
  return unitIdWhere(user);
}
