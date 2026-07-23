"use client";

// Loads the Google Maps JavaScript API script once per page, regardless of
// how many components ask for it — repeated calls all resolve from the
// same in-flight/completed promise instead of injecting duplicate
// <script> tags. Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — deliberately a
// separate, browser-exposed key from GOOGLE_PLACES_API_KEY (server-only,
// used for Places/Distance-Matrix/Photo lookups); Google's own guidance is
// that a Maps JavaScript API key is meant to ship to the browser, as long
// as it's HTTP-referrer-restricted in Cloud Console to this app's domains.

// No @types/google.maps in this project (a thin, isolated `any` boundary
// here beats adding a dependency just for one file's types) — every other
// component that touches the map talks to it only through NearbyMap.tsx's
// typed props, never the raw SDK.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleNamespace = any;

let loadPromise: Promise<GoogleNamespace> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("loadGoogleMaps called with no window"));
  const w = window as unknown as { google?: GoogleNamespace };
  if (w.google?.maps) return Promise.resolve(w.google);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker&loading=async`;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { google?: GoogleNamespace }).google;
      if (loaded?.maps) resolve(loaded);
      else reject(new Error("Google Maps script loaded but window.google.maps is missing"));
    };
    script.onerror = () => reject(new Error("Failed to load the Google Maps script"));
    document.head.appendChild(script);
  });
  return loadPromise;
}
