import { prisma } from "@/lib/prisma";
import { lookupPlace, haversineMeters } from "@/lib/places/googlePlacesClient";
import { formatDistance } from "@/lib/places/placeInsightFormat";

export { formatDistance };

/** Gentle pacing between calls within a category refresh — Places API has
 * per-second quotas, and there's no rush (this only ever runs when Admin
 * clicks "Refresh," never on a schedule). */
const REFRESH_DELAY_MS = 150;
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshPlaceInsight(category: string, name: string) {
  const [settings, result] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 }, select: { propertyLat: true, propertyLng: true } }),
    lookupPlace(name),
  ]);

  let distanceMeters: number | null = null;
  if (result.lat != null && result.lng != null && settings?.propertyLat != null && settings?.propertyLng != null) {
    distanceMeters = Math.round(haversineMeters(settings.propertyLat, settings.propertyLng, result.lat, result.lng));
  }

  return prisma.placeInsight.upsert({
    where: { category_name: { category, name } },
    create: {
      category, name,
      placeId: result.placeId, lat: result.lat, lng: result.lng, distanceMeters,
      rating: result.rating, ratingCount: result.ratingCount,
      openingHours: result.openingHoursText as any, openNow: result.openNow,
      summary: result.summary, businessStatus: result.businessStatus, fetchError: result.error,
    },
    update: {
      placeId: result.placeId, lat: result.lat, lng: result.lng, distanceMeters,
      rating: result.rating, ratingCount: result.ratingCount,
      openingHours: result.openingHoursText as any, openNow: result.openNow,
      summary: result.summary, businessStatus: result.businessStatus, fetchError: result.error,
      lastFetchedAt: new Date(),
    },
  });
}

export async function refreshCategoryInsights(category: string, names: string[]) {
  const results: { name: string; ok: boolean; error: string | null }[] = [];
  for (const name of names) {
    const row = await refreshPlaceInsight(category, name);
    results.push({ name, ok: !row.fetchError, error: row.fetchError });
    if (name !== names[names.length - 1]) await sleep(REFRESH_DELAY_MS);
  }
  return results;
}

export async function getPlaceInsightsByNames(names: string[]) {
  if (names.length === 0) return new Map<string, Awaited<ReturnType<typeof refreshPlaceInsight>>>();
  const rows = await prisma.placeInsight.findMany({ where: { name: { in: names } } });
  return new Map(rows.map((r) => [r.name, r]));
}

/** Every distinct category key that has at least one cached row — powers
 * the Admin refresh panel's "last refreshed" summary per category. */
export async function getCategoryRefreshSummary() {
  const rows = await prisma.placeInsight.groupBy({
    by: ["category"],
    _count: { _all: true },
    _max: { lastFetchedAt: true },
  });
  return new Map(rows.map((r) => [r.category, { count: r._count._all, lastFetchedAt: r._max.lastFetchedAt }]));
}
