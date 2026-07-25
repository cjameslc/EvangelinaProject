// Normalized shape every Unsplash image is reduced to before it's cached —
// strips Unsplash's much larger raw API response down to exactly what the
// UI and attribution/compliance requirements need.
export type UnsplashImage = {
  id: string;
  regular: string;
  full: string;
  small: string;
  thumb: string;
  /** Descriptive alt text — Unsplash's own alt_description/description
   * when present, otherwise a generic fallback built from the search
   * query (never left blank — every <img> needs real alt text). */
  alt: string;
  photographer: string;
  photographerProfile: string;
  /** Must be pinged (server-side, via UnsplashService.trackDownload) once
   * per photo selected for use, per Unsplash API guidelines. */
  downloadLocation: string;
};
