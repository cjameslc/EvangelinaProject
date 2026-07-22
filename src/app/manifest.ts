import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Evangelina's Staycation",
    short_name: "Evangelina's",
    description: "Bookings, calendar, housekeeping and admin for Evangelina's Staycation units.",
    // "/" used to be staff-only (redirected straight to /login), so
    // start_url pointed at /dashboard to skip that bounce. Now "/" is the
    // public guest homepage — a guest reopening the installed app needs to
    // land there, not on a staff-only page. Staff are unaffected: "/"
    // still server-side redirects a signed-in staff session straight to
    // their role's page (src/app/page.tsx), so this is one extra redirect
    // hop for staff, invisible to the user, in exchange for guests
    // actually landing somewhere real.
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ff385c",
    orientation: "portrait-primary",
    // Deliberately "any" only, no separate "maskable" icon — several real
    // install paths (macOS PWA install, some Android launchers) don't
    // reliably respect the purpose distinction and were rendering the
    // maskable variant's pink safe-zone padding as a solid border around
    // the logo instead of applying their own adaptive mask to it. A plain
    // full-bleed icon renders identically (and correctly) everywhere,
    // matching how iOS's apple-touch-icon already looks.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
