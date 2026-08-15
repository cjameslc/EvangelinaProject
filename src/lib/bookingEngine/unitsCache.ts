import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultOwnerId } from "@/lib/ownerScope";

export type CachedUnit = {
  id: string;
  name: string;
  shortName: string;
  unitNumber: string;
  location: string;
  nightlyRate: number;
  photoUrl: string | null;
  rating: number;
};

/**
 * The public home page, a single listing page, and every guest availability
 * search (booking-quote) all re-fetch this same active-units list — and
 * photoUrl is a base64 data-URL per unit (tens to hundreds of KB each), so
 * this was ~450KB of DB payload re-serialized on every single request to
 * the app's highest-traffic, least-personalized pages. Unit photos/rates
 * only ever change when an Admin edits them (Units tab), so this is cached
 * the same way Settings already is — 60s revalidate, one DB round trip per
 * window instead of one per visitor.
 *
 * Scoped to an owner — before this, `where: { active: true }` had no owner
 * filter at all, so the public guest booking site was silently listing
 * every active unit across every owner on the platform mixed into one
 * inventory. Optional param (defaults to the default owner, see
 * getDefaultOwnerId's doc comment) — the unprefixed /book page keeps
 * working unchanged; /o/[ownerSlug]/book passes its own resolved ownerId.
 */
export const getCachedActiveUnits = unstable_cache(
  async (ownerIdArg?: string): Promise<CachedUnit[]> => {
    const ownerId = ownerIdArg ?? (await getDefaultOwnerId());
    return prisma.unit.findMany({
      where: { active: true, ownerId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, shortName: true, unitNumber: true, location: true, nightlyRate: true, photoUrl: true, rating: true },
    });
  },
  ["active-units-public"],
  { revalidate: 60 }
);

/**
 * The root layout's footer ("Cubao, Quezon City · 5 units") reads this on
 * literally every page in the app, guest and staff alike — same overcounted-
 * DB-round-trip shape as getCachedActiveUnits above, just a `count()`
 * instead of a full row fetch. Changes only when Admin adds/deactivates a
 * unit, so a 60s window is imperceptible and saves a query per request.
 * Same default-owner scoping as getCachedActiveUnits above — the footer is
 * rendered by the session-less root layout, so it always shows the default
 * owner's count regardless of which owner's page is being visited (no
 * optional-param plumbing here since nothing calls this any other way yet).
 */
export const getCachedActiveUnitCount = unstable_cache(
  async (): Promise<number> => {
    const ownerId = await getDefaultOwnerId();
    return prisma.unit.count({ where: { active: true, ownerId } });
  },
  ["active-unit-count"],
  { revalidate: 60 }
);
