import type { UnsplashImage } from "./types";

const API_BASE = "https://api.unsplash.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalize(raw: any, fallbackAlt: string): UnsplashImage {
  return {
    id: raw.id,
    regular: raw.urls.regular,
    full: raw.urls.full,
    small: raw.urls.small,
    thumb: raw.urls.thumb,
    alt: raw.alt_description || raw.description || fallbackAlt,
    photographer: raw.user?.name || "Unknown",
    photographerProfile: raw.user?.links?.html || "https://unsplash.com",
    downloadLocation: raw.links?.download_location || "",
  };
}

/**
 * A single call per category (not per image) — Unsplash's /photos/random
 * accepts a count up to 30, so "6 hero images" is one request, not six.
 * Server-only: UNSPLASH_ACCESS_KEY never reaches the browser. Called only
 * by the cache-warming job and the admin manual-refresh action, never by
 * anything on a guest page-view path — see UnsplashImageCache's schema
 * comment for why (Demo-tier 50 req/hour).
 */
export async function fetchRandomPhotos(query: string, count: number): Promise<UnsplashImage[]> {
  const accessKey = requireEnv("UNSPLASH_ACCESS_KEY");
  const params = new URLSearchParams({
    query,
    count: String(Math.min(count, 30)),
    orientation: "landscape",
    content_filter: "high",
  });
  const res = await fetch(`${API_BASE}/photos/random?${params.toString()}`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Unsplash /photos/random failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const list = Array.isArray(data) ? data : [data];
  return list.map((raw) => normalize(raw, query));
}

/**
 * Unsplash API guideline compliance: "every time your application performs
 * something similar to a download... trigger a GET request to this
 * endpoint." For a hotlinked background/decorative image (this app's
 * entire use case — nothing is ever actually downloaded to a file), the
 * documented-acceptable interpretation is to trigger this once per photo
 * when it's selected for real use in the app, not on every subsequent page
 * render of an already-cached image — otherwise a popular cached image
 * viewed by hundreds of guests would fire hundreds of redundant download
 * pings for a single one-time cache-warm selection. Fired here, once, at
 * the moment a photo is written into the cache (see service.ts).
 * Best-effort: a failed ping must never block the image from displaying.
 */
export async function trackDownload(downloadLocation: string): Promise<void> {
  if (!downloadLocation) return;
  const accessKey = requireEnv("UNSPLASH_ACCESS_KEY");
  try {
    await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch {
    // Best-effort — see comment above.
  }
}
