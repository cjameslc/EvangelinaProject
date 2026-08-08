// Subtle noise texture — one shared implementation (spec: "do not add
// noise over tables/charts/forms/calendar/dense operational data"), used
// only on the new Metrics hero and large seasonal banners. Pure inline SVG
// feTurbulence as a data URI, no external asset/network request, low
// opacity so it reads as texture, not visible grain.
const GRAIN_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

export function Grain({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ backgroundImage: `url("${GRAIN_DATA_URL}")`, opacity: 0.05, mixBlendMode: "overlay" }}
    />
  );
}
