import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unitScope } from "@/lib/rbac";

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

/** Prisma `where` fragment scoping a unit-bearing query to what this user may see. */
export function unitWhere(user: { role: string; ownedUnitIds: string[] }) {
  const scope = unitScope(user.role as any, user.ownedUnitIds);
  return scope === "all" ? {} : { unitId: { in: scope } };
}

/** Same as {@link unitWhere}, but for querying the Unit model itself (keyed by `id`, not `unitId`). */
export function unitIdWhere(user: { role: string; ownedUnitIds: string[] }) {
  const scope = unitScope(user.role as any, user.ownedUnitIds);
  return scope === "all" ? {} : { id: { in: scope } };
}

/**
 * Write-path guard: is this specific unit inside what the user may touch?
 * `unitWhere`/`unitIdWhere` filter list queries so a Co-owner only ever
 * *sees* their own units — but that filter does nothing on a mutation
 * targeting one exact unitId (create a booking/calendar block for it, or
 * edit/delete an existing row that belongs to it), since there's no list to
 * filter. Every write route that accepts a unitId, or looks one up off an
 * existing row before mutating it, must check this explicitly.
 */
export function isUnitInScope(user: { role: string; ownedUnitIds: string[] }, unitId: string | null | undefined): boolean {
  const scope = unitScope(user.role as any, user.ownedUnitIds);
  return scope === "all" || (!!unitId && scope.includes(unitId));
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
export function dashboardUnitWhere(user: { role: string; ownedUnitIds: string[] }) {
  if (user.role === "OWNER_ADMIN") return user.ownedUnitIds.length ? { unitId: { in: user.ownedUnitIds } } : {};
  return unitWhere(user);
}
export function dashboardUnitIdWhere(user: { role: string; ownedUnitIds: string[] }) {
  if (user.role === "OWNER_ADMIN") return user.ownedUnitIds.length ? { id: { in: user.ownedUnitIds } } : {};
  return unitIdWhere(user);
}
