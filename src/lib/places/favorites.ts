"use client";

// Per-device "Save to Favorites" for Nearby places — no guest account
// concept applies here (a place isn't tied to a booking), so this is
// deliberately just localStorage, not a DB table. Keyed by "category::name"
// since that's the same natural key PlaceInsight itself uses.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "eva-nearby-favorites";

function readAll(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeAll(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private browsing, quota) — favoriting just
    // silently doesn't persist rather than throwing.
  }
}

export function favoriteKey(category: string, name: string): string {
  return `${category}::${name}`;
}

/** Favorite state for one place, plus a toggle — reads localStorage once on
 * mount (SSR-safe: starts false, syncs after hydration) and broadcasts
 * changes to any other card watching the same key via a custom event. */
export function useFavorite(key: string): [boolean, () => void] {
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    setIsFavorite(readAll().includes(key));
    function onChange() {
      setIsFavorite(readAll().includes(key));
    }
    window.addEventListener("eva-favorites-changed", onChange);
    return () => window.removeEventListener("eva-favorites-changed", onChange);
  }, [key]);

  const toggle = useCallback(() => {
    const current = readAll();
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    writeAll(next);
    window.dispatchEvent(new Event("eva-favorites-changed"));
  }, [key]);

  return [isFavorite, toggle];
}

/** All favorited keys — used by the "Favorites only" search filter. */
export function useAllFavorites(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(readAll());
    function onChange() {
      setIds(readAll());
    }
    window.addEventListener("eva-favorites-changed", onChange);
    return () => window.removeEventListener("eva-favorites-changed", onChange);
  }, []);
  return ids;
}
