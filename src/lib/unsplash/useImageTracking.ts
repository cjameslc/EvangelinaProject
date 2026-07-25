"use client";

import { useEffect } from "react";
import type { UnsplashImage } from "./types";

// Module-level, not per-component-instance — the same image can appear in
// several places in one page session (e.g. reused across a tile and a
// gallery thumbnail); this ensures it's only ever tracked once per browser
// session regardless of how many components render it or how many times
// they re-render.
const tracked = new Set<string>();

/** Fires Unsplash's required download-tracking ping exactly once per image
 * per browser session, the moment that specific image is actually
 * rendered to a guest — see /api/images/track-download's comment for why
 * this happens here (client, on real display) rather than during the
 * server-side cache warm. Fire-and-forget: a tracking failure must never
 * affect the image actually showing. */
export function useTrackUnsplashView(image: UnsplashImage | null | undefined) {
  useEffect(() => {
    if (!image || tracked.has(image.id)) return;
    tracked.add(image.id);
    fetch("/api/images/track-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadLocation: image.downloadLocation }),
    }).catch(() => {});
  }, [image]);
}
