// This app already satisfies Capacitor's usual prerequisites (relative API
// paths, no Node-only runtime features reachable from client code, a
// standard web-app manifest + service worker) — wrapping it for Android/iOS
// later should be a config-only step, no architecture change needed here.

// Every image the app actually renders is either a local /public asset, a
// Vercel Blob upload (guest payment proofs, housekeeping photos — always
// *.public.blob.vercel-storage.com), or a Google Place photo streamed
// through our own /api/places/photo proxy (never fetched client-side from
// a Google host directly). next/image itself is unused (0 <Image>
// components in this codebase), so the specific remote hosts below only
// matter if that ever changes — the previous hostname: "**" wildcard left
// the built-in /_next/image optimizer reachable as an open SSRF/DoS proxy
// for literally any URL, which is what this list replaces.
const IMAGE_REMOTE_PATTERNS = [
  { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
];

// No nonce-based strict-dynamic CSP here — that requires generating a
// per-request nonce in middleware and threading it through Next's own
// inline hydration/RSC scripts, a larger dedicated change with real
// regression risk to the existing custom NextAuth middleware. 'unsafe-inline'
// for script/style is the documented tradeoff; everything else here is a
// real restriction (no arbitrary external scripts/frames/objects). Hosts
// allowed are exactly what's used: Google Maps JS API (script + its own
// tile/geocoding requests) and Vercel Blob (guest/housekeeping photos).
// 'unsafe-eval' is required too — confirmed by testing the live map page,
// the Maps JS API itself evaluates dynamically generated code internally
// (a long-documented characteristic of that library, not something this
// app's own code does or could avoid).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.googleapis.com https://*.gstatic.com",
  "font-src 'self' data:",
  "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: IMAGE_REMOTE_PATTERNS },
  async headers() {
    return [
      {
        // no-cache (not no-store) so the browser always revalidates sw.js
        // with the server — this is what makes SW updates actually show up
        // instead of the browser serving a stale worker from disk cache.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      { source: "/(.*)", headers: SECURITY_HEADERS },
    ];
  },
};

export default nextConfig;
