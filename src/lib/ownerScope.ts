import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
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

/**
 * The one owner id to fall back to at the handful of call sites that have
 * no session/user at all to derive an ownerId from — public guest pages
 * (/, /book, /guide/*), the AI Concierge's anonymous-visitor context, and
 * cron/background sync jobs (TTLock event sync's trusted-usernames check).
 * These paths were never actually made multi-tenant-aware (no subdomain/
 * slug-based routing exists for the public site) — they're all still
 * implicitly "Evangelina's site," so resolving that explicitly here (by
 * her stable slug, not a hardcoded id) is the honest fix for the real
 * risk (a second owner's *staff* actions corrupting her Settings row),
 * without pretending to solve a separate, much larger feature (a fully
 * multi-tenant public booking site) nobody asked for. Cached an hour —
 * the default owner's slug essentially never changes.
 */
export const getDefaultOwnerId = unstable_cache(
  async (): Promise<string | null> => {
    const owner = await prisma.owner.findUnique({ where: { slug: "evangelinas" }, select: { id: true } });
    return owner?.id ?? null;
  },
  ["default-owner-id"],
  { revalidate: 3600 }
);

/** URL-safe, matches what SLUG_REGEX (below) enforces at creation time. */
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type OwnerBrief = {
  id: string;
  businessName: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  status: string;
};

/**
 * Resolves a real Owner by its public slug — the backing lookup for
 * /o/[ownerSlug]/... routes, the first (and so far only) real per-owner
 * guest-facing entry point. Returns null for an unknown OR malformed slug
 * (checked before ever hitting the DB, since a raw URL segment is
 * untrusted input) so callers can notFound() either way without a special
 * case. Cached the same 60s window as Settings/units — a slug essentially
 * never changes after an owner is created.
 */
export const getOwnerBySlug = unstable_cache(
  async (slug: string): Promise<OwnerBrief | null> => {
    if (!SLUG_REGEX.test(slug)) return null;
    return prisma.owner.findUnique({
      where: { slug },
      select: { id: true, businessName: true, slug: true, logoUrl: true, primaryColor: true, status: true },
    });
  },
  ["owner-by-slug"],
  { revalidate: 60 }
);

/** Thin convenience wrapper for the (more common) call sites that only need the id. */
export async function getOwnerIdBySlug(slug: string): Promise<string | undefined> {
  const owner = await getOwnerBySlug(slug);
  return owner?.id;
}

export function isValidOwnerSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

/**
 * businessName has no DB-level unique constraint (unlike slug/username) —
 * slug is what actually has to be unique for /o/[ownerSlug] routing to
 * work, and it's derived from businessName but de-duplicated separately
 * (uniqueValue() in the owners route appends -2/-3 on a slug collision),
 * so two owners ending up with the exact same *display* name was always
 * structurally possible — confirmed live (a renamed "Test Staycation" and
 * a newly-created owner both read "The Felian," genuinely indistinguishable
 * in any UI that only shows the name). Case/whitespace-insensitive since
 * "The Felian" vs "the felian " reads as the same collision to a human
 * even though SQLite's own default TEXT comparison wouldn't catch it.
 * excludeOwnerId lets an edit re-save an owner's own unchanged name
 * without tripping over itself.
 */
export async function findDuplicateBusinessName(businessName: string, excludeOwnerId?: string): Promise<boolean> {
  const normalized = businessName.trim().toLowerCase();
  const owners = await prisma.owner.findMany({ select: { id: true, businessName: true } });
  return owners.some((o) => o.id !== excludeOwnerId && o.businessName.trim().toLowerCase() === normalized);
}
