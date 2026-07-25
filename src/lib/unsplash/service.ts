import { prisma } from "@/lib/prisma";
import { fetchRandomPhotos } from "./client";
import { UNSPLASH_CATEGORIES } from "./categories";
import type { UnsplashImage } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h, per spec

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The one function every guest-facing component calls. Pure cache read —
 * never touches the live Unsplash API, never throws (an unpopulated or
 * errored category just returns an empty array; callers render their own
 * local placeholder — see UnsplashTile's fallback). This is what makes it
 * safe to call from every tile on a page without any rate-limit risk.
 */
export async function getCategoryImages(category: string): Promise<UnsplashImage[]> {
  const row = await prisma.unsplashImageCache.findUnique({ where: { category } }).catch(() => null);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.images);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Same as getCategoryImages, but for several slots in one DB round trip —
 * used by pages that render many tiles at once (the guest homepage). */
export async function getCategoryImagesBatch(categories: string[]): Promise<Record<string, UnsplashImage[]>> {
  const rows = await prisma.unsplashImageCache.findMany({ where: { category: { in: categories } } }).catch(() => []);
  const result: Record<string, UnsplashImage[]> = {};
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.images);
      result[row.category] = Array.isArray(parsed) ? parsed : [];
    } catch {
      result[row.category] = [];
    }
  }
  return result;
}

function isStale(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() > CACHE_TTL_MS;
}

/**
 * Live-fetches one category and writes it to cache — the only place that
 * calls Unsplash on behalf of a category besides the cache-warm loop
 * below. On failure, existing cached images are left completely untouched
 * (only fetchError is updated) — a transient Unsplash outage degrades to
 * "yesterday's images," never to a broken slot.
 */
export async function refreshCategory(categoryKey: string): Promise<{ ok: boolean; error?: string }> {
  const def = UNSPLASH_CATEGORIES.find((c) => c.key === categoryKey);
  if (!def) return { ok: false, error: `Unknown category "${categoryKey}"` };

  try {
    const images = await fetchRandomPhotos(def.query, def.count);
    await prisma.unsplashImageCache.upsert({
      where: { category: def.key },
      create: { category: def.key, query: def.query, images: JSON.stringify(images), fetchError: null, fetchedAt: new Date() },
      update: { query: def.query, images: JSON.stringify(images), fetchError: null, fetchedAt: new Date() },
    });
    // Download-tracking deliberately does NOT fire here. It used to (once
    // per cached image, right after fetching) and that was a real bug: a
    // cache-warm run search-calls once per *category* (32 total, safely
    // under the 50/hour Demo-tier cap) but was ALSO firing one tracking
    // call per *image* — with the counts this app uses that's 100+ extra
    // calls in the same burst, which exhausted the hourly quota outright
    // (confirmed live: the warm run 403'd partway through). Tracking now
    // fires lazily, once per image, only when a guest is actually shown
    // that specific image — see POST /api/images/track-download and
    // useUnsplashTracking — which is both the correct compliance
    // interpretation ("triggered when displayed") and spreads the calls
    // over real traffic instead of bursting them during one cache refresh.
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await prisma.unsplashImageCache
      .upsert({
        where: { category: def.key },
        create: { category: def.key, query: def.query, images: "[]", fetchError: message, fetchedAt: new Date() },
        update: { fetchError: message }, // images/fetchedAt left as-is on failure
      })
      .catch(() => {});
    return { ok: false, error: message };
  }
}

/**
 * Cache-warming — piggybacked on the existing daily cron (same "no new
 * Vercel cron slot" discipline as the TTLock/iCal sync jobs), refreshing
 * only categories whose cache has actually gone stale (>24h) or never
 * existed. A cold-start (every category stale) is ~32 sequential calls, a
 * couple seconds apart — comfortably inside the 50/hour Demo-tier budget
 * even run back-to-back with itself once. Never runs in parallel with
 * itself in practice (daily cron only), so no locking needed.
 */
export async function warmUnsplashCache(): Promise<{ key: string; ok: boolean; error?: string; skipped?: boolean }[]> {
  const existing = await prisma.unsplashImageCache.findMany({ select: { category: true, fetchedAt: true, fetchError: true } });
  const rowByKey = new Map(existing.map((r) => [r.category, r]));

  const results: { key: string; ok: boolean; error?: string; skipped?: boolean }[] = [];
  for (const def of UNSPLASH_CATEGORIES) {
    const row = rowByKey.get(def.key);
    // A row with fetchError set never had a successful fetch — even though
    // fetchedAt got stamped on that failed attempt (see refreshCategory's
    // create branch), it must always retry on the next warm pass rather
    // than being treated as "checked recently" for a full 24h with zero
    // real images to show.
    if (row && !row.fetchError && !isStale(row.fetchedAt)) {
      results.push({ key: def.key, ok: true, skipped: true });
      continue;
    }
    const result = await refreshCategory(def.key);
    results.push({ key: def.key, ...result });
    // Short pacing, not a rate-limit necessity (32 calls is nowhere near
    // 50/hour on its own) — keeps this considerate of Unsplash's servers,
    // while staying short enough that a fully-cold cache (worst case, only
    // realistically hit once, on first run after deploy) still finishes
    // well inside the cron route's 60s maxDuration alongside its other work.
    await sleep(800);
  }
  return results;
}
