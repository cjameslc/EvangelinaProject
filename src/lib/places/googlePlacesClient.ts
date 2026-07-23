// Thin client for Google's Places API (classic JSON endpoints) — resolves
// a place name to a place_id, fetches the fields the Nearby pages show
// (location, hours, rating, price level, contact info, editorial summary),
// then a Distance Matrix call for real walking/driving time from the
// property. Three billed API calls per place; see placeInsightService.ts
// for why refreshes are admin-triggered per category rather than
// automatic/scheduled.

const FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

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
  priceLevel: number | null;
  phoneNumber: string | null;
  website: string | null;
  walkMinutes: number | null;
  driveMinutes: number | null;
  error: string | null;
};

const EMPTY_RESULT: Omit<PlaceLookupResult, "error"> = {
  placeId: null, lat: null, lng: null, rating: null, ratingCount: null,
  openingHoursText: null, openNow: null, summary: null, businessStatus: null,
  priceLevel: null, phoneNumber: null, website: null, walkMinutes: null, driveMinutes: null,
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
  url.searchParams.set(
    "fields",
    "geometry,opening_hours,rating,user_ratings_total,editorial_summary,business_status,price_level,formatted_phone_number,website"
  );
  url.searchParams.set("language", "en");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK") {
    return { result: null, error: `Place details failed: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}` };
  }
  return { result: data.result, error: null };
}

/** Real walking/driving duration from the property to the place — a
 * separate billed call from the free haversine distance, so it only ever
 * runs once we already have real coordinates for both ends. Returns nulls
 * (never a guess) if the request fails or Google can't route it. */
async function getWalkDriveMinutes(
  originLat: number, originLng: number, destLat: number, destLng: number, apiKey: string
): Promise<{ walkMinutes: number | null; driveMinutes: number | null }> {
  async function oneMode(mode: "walking" | "driving"): Promise<number | null> {
    const url = new URL(DISTANCE_MATRIX_URL);
    url.searchParams.set("origins", `${originLat},${originLng}`);
    url.searchParams.set("destinations", `${destLat},${destLng}`);
    url.searchParams.set("mode", mode);
    url.searchParams.set("key", apiKey);
    try {
      const res = await fetch(url);
      const data = await res.json();
      const element = data?.rows?.[0]?.elements?.[0];
      if (data.status !== "OK" || element?.status !== "OK") return null;
      return Math.round(element.duration.value / 60);
    } catch {
      return null;
    }
  }
  const [walkMinutes, driveMinutes] = await Promise.all([oneMode("walking"), oneMode("driving")]);
  return { walkMinutes, driveMinutes };
}

/** Resolves a place by name (scoped to `context` to disambiguate common
 * names like "Starbucks"), fetches its details, then — when the property's
 * own coordinates are supplied — real walk/drive times too. Every field is
 * either real Google data or null; nothing here is guessed. */
export async function lookupPlace(
  name: string,
  origin: { lat: number; lng: number } | null,
  context = "Cubao, Quezon City, Philippines"
): Promise<PlaceLookupResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ...EMPTY_RESULT, error: "GOOGLE_PLACES_API_KEY is not configured" };

  try {
    const { placeId, error: findError } = await findPlaceId(`${name}, ${context}`, apiKey);
    if (!placeId) return { ...EMPTY_RESULT, error: findError };

    const { result, error: detailsError } = await getPlaceDetails(placeId, apiKey);
    if (!result) return { ...EMPTY_RESULT, placeId, error: detailsError };

    const lat = result.geometry?.location?.lat ?? null;
    const lng = result.geometry?.location?.lng ?? null;

    let walkMinutes: number | null = null;
    let driveMinutes: number | null = null;
    if (origin && lat != null && lng != null) {
      const durations = await getWalkDriveMinutes(origin.lat, origin.lng, lat, lng, apiKey);
      walkMinutes = durations.walkMinutes;
      driveMinutes = durations.driveMinutes;
    }

    return {
      placeId,
      lat, lng,
      rating: result.rating ?? null,
      ratingCount: result.user_ratings_total ?? null,
      openingHoursText: result.opening_hours?.weekday_text ?? null,
      openNow: result.opening_hours?.open_now ?? null,
      summary: result.editorial_summary?.overview ?? null,
      businessStatus: result.business_status ?? null,
      priceLevel: result.price_level ?? null,
      phoneNumber: result.formatted_phone_number ?? null,
      website: result.website ?? null,
      walkMinutes, driveMinutes,
      error: null,
    };
  } catch (e) {
    return { ...EMPTY_RESULT, error: e instanceof Error ? e.message : "Places lookup threw an unexpected error" };
  }
}

/** Great-circle distance in meters — free (no API call), used for the
 * headline distance figure instead of a second billed call. Deliberately
 * presented to guests as straight-line distance, not a claimed walking
 * route (walkMinutes/driveMinutes above are the real route figures). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
