import { getCurrentUser } from "@/lib/session";

// Multi-owner platform layer — tenant (Owner) scoping, separate from and
// on top of the existing role/unitWhere system in session.ts/rbac.ts. See
// the Owner model's doc comment in prisma/schema.prisma for the overall
// design: Unit/User/Employee carry ownerId directly, everything else
// (Booking, CalendarBlock, AccessCredential, HousekeepingUnitState, etc.)
// derives it transitively through their required unitId relation.
//
// Important: isPlatformAdmin does NOT make these helpers return "see
// everyone" — James's day-to-day Dashboard/Bookings/Calendar must stay
// scoped to his own owner (Evangelina), exactly like any other owner's
// admin, not silently merge every owner's data together. Cross-owner
// views are a deliberately separate, explicitly-gated code path (see
// requirePlatformAdmin below) used only by dedicated platform-level
// routes/pages, never by the regular business UI.

export type OwnerScopeUser = { ownerId: string | null };

/** Prisma `where` fragment for the Unit model itself. */
export function ownerUnitWhere(user: OwnerScopeUser) {
  return { ownerId: user.ownerId };
}

/** Same, for any model with a direct, required `unit` relation (Booking,
 * CalendarBlock, AccessCredential, HousekeepingUnitState, ReserveAccessCode,
 * Bill, Stock, etc.) — owner is derived through the unit, never
 * denormalized onto these tables. */
export function ownerViaUnitWhere(user: OwnerScopeUser) {
  return { unit: { ownerId: user.ownerId } };
}

/** For User/Employee, which carry ownerId directly (see the Owner model's
 * doc comment for why — Employee.userId is optional, so it can't always be
 * derived via a user relation). */
export function ownerStaffWhere(user: OwnerScopeUser) {
  return { ownerId: user.ownerId };
}

type PlatformAdminUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Guard for platform-only routes/pages (Platform Dashboard, the Owners
 * list, owner create/suspend) — the one place in the app allowed to query
 * across every owner at once. Everything else must go through
 * requireUser() + the owner*Where helpers above, scoped to the caller's
 * own ownerId, same as any other tenant-scoped query.
 */
export async function requirePlatformAdmin(): Promise<
  { user: PlatformAdminUser; error: undefined } | { user: undefined; error: Response }
> {
  const user = await getCurrentUser();
  if (!user) return { user: undefined, error: new Response("Unauthorized", { status: 401 }) };
  if (!user.isPlatformAdmin) return { user: undefined, error: new Response("Forbidden", { status: 403 }) };
  return { user, error: undefined };
}
