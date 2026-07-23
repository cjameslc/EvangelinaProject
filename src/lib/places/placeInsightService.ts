import { prisma } from "@/lib/prisma";
import { lookupPlace, haversineMeters } from "@/lib/places/googlePlacesClient";
import { generateHostOverview } from "@/lib/ai/placeOverview";
import { formatDistance } from "@/lib/places/placeInsightFormat";

export { formatDistance };

/** Gentle pacing between calls within a category refresh — Places API has
 * per-second quotas, and there's no rush (this only ever runs when Admin
 * clicks "Refresh," never on a schedule). */
const REFRESH_DELAY_MS = 150;
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshPlaceInsight(category: string, categoryLabel: string, name: string) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 }, select: { propertyLat: true, propertyLng: true } });
  const origin = settings?.propertyLat != null && settings?.propertyLng != null ? { lat: settings.propertyLat, lng: settings.propertyLng } : null;

  const result = await lookupPlace(name, origin);

  let distanceMeters: number | null = null;
  if (result.lat != null && result.lng != null && origin) {
    distanceMeters = Math.round(haversineMeters(origin.lat, origin.lng, result.lat, result.lng));
  }

  // Only worth the extra Gemini call when the lookup actually succeeded —
  // no point generating a blurb for a place that failed to resolve.
  const hostOverview = result.error
    ? null
    : await generateHostOverview({
        name, categoryLabel, distanceMeters, walkMinutes: result.walkMinutes,
        rating: result.rating, ratingCount: result.ratingCount, priceLevel: result.priceLevel, googleSummary: result.summary,
      });

  const data = {
    placeId: result.placeId, lat: result.lat, lng: result.lng, distanceMeters,
    rating: result.rating, ratingCount: result.ratingCount,
    openingHours: result.openingHoursText as any, openNow: result.openNow,
    summary: result.summary, businessStatus: result.businessStatus,
    walkMinutes: result.walkMinutes, driveMinutes: result.driveMinutes,
    priceLevel: result.priceLevel, phoneNumber: result.phoneNumber, website: result.website,
    photoReference: result.photoReference,
    hostOverview, fetchError: result.error,
  };

  return prisma.placeInsight.upsert({
    where: { category_name: { category, name } },
    create: { category, name, ...data },
    update: { ...data, lastFetchedAt: new Date() },
  });
}

export async function refreshCategoryInsights(category: string, categoryLabel: string, names: string[]) {
  const results: { name: string; ok: boolean; error: string | null }[] = [];
  for (const name of names) {
    const row = await refreshPlaceInsight(category, categoryLabel, name);
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
