/** Deterministic pick from a list, seeded by a stable id (e.g. booking.id)
 * — the same guest sees the same hero image across reloads during their
 * stay instead of it flickering to a different one every visit, while
 * different guests/bookings still get real variety across the cached set. */
export function pickStable<T>(items: T[], seed: string): T | null {
  if (items.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return items[hash % items.length];
}
