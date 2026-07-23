import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

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
 */
export const getCachedActiveUnits = unstable_cache(
  async (): Promise<CachedUnit[]> =>
    prisma.unit.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, shortName: true, unitNumber: true, location: true, nightlyRate: true, photoUrl: true, rating: true },
    }),
  ["active-units-public"],
  { revalidate: 60 }
);
