// Thin client for Google's Places API (classic JSON endpoints) — resolves
// a place name to a place_id, then fetches the fields the Nearby pages
// actually show (location, hours, rating, editorial summary). Two billed
// API calls per place; see placeInsightService.ts for why refreshes are
// admin-triggered per category rather than automatic/scheduled.

const FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export function isPlacesApiConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

export type PlaceLookupResult = {
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  ratingCount: number | null;
  openingHoursText: string[] | null;
  openNow: boolean | null;
  summary: string | null;
  businessStatus: string | null;
  error: string | null;
};

const EMPTY_RESULT: Omit<PlaceLookupResult, "error"> = {
  placeId: null, lat: null, lng: null, rating: null, ratingCount: null,
  openingHoursText: null, openNow: null, summary: null, businessStatus: null,
};

async function findPlaceId(query: string, apiKey: string): Promise<{ placeId: string | null; error: string | null }> {
  const url = new URL(FIND_PLACE_URL);
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id");
  url.searchParams.set("language", "en"); // deterministic weekday_text parsing downstream
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "ZERO_RESULTS") return { placeId: null, error: "No matching place found" };
  if (data.status !== "OK" || !data.candidates?.length) {
    return { placeId: null, error: `Places lookup failed: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}` };
  }
  return { placeId: data.candidates[0].place_id as string, error: null };
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<{ result: any | null; error: string | null }> {
  const url = new URL(PLACE_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "geometry,opening_hours,rating,user_ratings_total,editorial_summary,business_status");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK") {
    return { result: null, error: `Place details failed: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}` };
  }
  return { result: data.result, error: null };
}

/** Resolves a place by name (scoped to `context` to disambiguate common
 * names like "Starbucks") and fetches its details. Every field is either
 * real Google data or null — nothing here is guessed. */
export async function lookupPlace(name: string, context = "Cubao, Quezon City, Philippines"): Promise<PlaceLookupResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ...EMPTY_RESULT, error: "GOOGLE_PLACES_API_KEY is not configured" };

  try {
    const { placeId, error: findError } = await findPlaceId(`${name}, ${context}`, apiKey);
    if (!placeId) return { ...EMPTY_RESULT, error: findError };

    const { result, error: detailsError } = await getPlaceDetails(placeId, apiKey);
    if (!result) return { ...EMPTY_RESULT, placeId, error: detailsError };

    return {
      placeId,
      lat: result.geometry?.location?.lat ?? null,
      lng: result.geometry?.location?.lng ?? null,
      rating: result.rating ?? null,
      ratingCount: result.user_ratings_total ?? null,
      openingHoursText: result.opening_hours?.weekday_text ?? null,
      openNow: result.opening_hours?.open_now ?? null,
      summary: result.editorial_summary?.overview ?? null,
      businessStatus: result.business_status ?? null,
      error: null,
    };
  } catch (e) {
    return { ...EMPTY_RESULT, error: e instanceof Error ? e.message : "Places lookup threw an unexpected error" };
  }
}

/** Great-circle distance in meters — free (no API call), used instead of a
 * second billed Directions/Distance Matrix call. Deliberately presented to
 * guests as straight-line distance, not a claimed walking route. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
