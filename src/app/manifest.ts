import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Evangelina's Staycation",
    short_name: "Evangelina's",
    description: "Bookings, calendar, housekeeping and admin for Evangelina's Staycation units.",
    start_url: "/dashboard",
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
