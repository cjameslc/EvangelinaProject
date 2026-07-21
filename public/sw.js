const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

// Only these GET endpoints are cached for offline reads — the ones the
// offline-capable screens (Housekeeping Today, Bookings) actually depend on.
// Everything else always goes to the network.
const API_ALLOWLIST = ["/api/housekeeping", "/api/bookings", "/api/calendar"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function isApiAllowlisted(pathname) {
  return API_ALLOWLIST.some((p) => pathname.startsWith(p));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Mutations always go straight to the network — src/lib/offlineQueue.ts
  // handles failures for those in app code, not here.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Next.js build output is content-hashed and immutable — safe cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  if (isApiAllowlisted(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(API_CACHE).then((cache) => cache.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.open(API_CACHE).then((cache) => cache.match(request)))
    );
    return;
  }

  // Page navigations: network-first, so middleware's auth redirects always
  // run whenever the network is actually up. Only fall back to the generic
  // offline page when the request truly fails.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

// Stubs for future push notifications (FCM/OneSignal) — intentionally not
// wired to anything yet.
self.addEventListener("push", () => {});
self.addEventListener("notificationclick", () => {});
