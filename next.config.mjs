// This app already satisfies Capacitor's usual prerequisites (relative API
// paths, no Node-only runtime features reachable from client code, a
// standard web-app manifest + service worker) — wrapping it for Android/iOS
// later should be a config-only step, no architecture change needed here.

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
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
    ];
  },
};

export default nextConfig;
