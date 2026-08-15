import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { manilaDayStart } from "@/lib/format";
import { resolveActiveSkinId } from "@/lib/skins/resolveActiveSkinId";
import { getDefaultOwnerId } from "@/lib/ownerScope";
import type { SkinId } from "@/lib/skins/types";

/**
 * booking-quote and guest/bookings are the most frequently hit routes in
 * the app (every availability search, every booking submit), but Settings
 * (rates, dpFee) only ever changes when an Admin edits it. Cached for 60s
 * — same revalidate window Dashboard/Analytics already use — so a rate
 * change still shows up within a minute without a DB round trip on every
 * single quote.
 *
 * ownerId is a real argument (not a fixed keyParts entry), so
 * unstable_cache's own argument-hashing keeps each owner's settings in a
 * separate cache entry — callers with a real session (Dashboard) pass
 * user.ownerId; the guest-facing booking flow has no session to derive one
 * from and passes getDefaultOwnerId() instead (see that helper's doc
 * comment in src/lib/ownerScope.ts for why that's the honest fix here,
 * not full per-owner guest-site routing).
 */
export const getCachedBookingSettings = unstable_cache(
  async (ownerId: string) => prisma.settings.upsert({ where: { ownerId }, update: {}, create: { ownerId } }),
  ["booking-settings"],
  { revalidate: 60 }
);

/**
 * Server-resolved active seasonal skin (see src/lib/skins/) — read once in
 * the root layout and threaded down via SeasonalSkinProvider, so every page
 * agrees on the same skin with no client-side flash. 60s cache, same
 * window as getCachedBookingSettings above (they share the same
 * underlying Settings row) — an Admin's manual skin change shows up
 * app-wide within a minute.
 *
 * Always resolves the default owner internally (getDefaultOwnerId() is a
 * plain cached DB read, not a cookies()/session read) — the root layout
 * that calls this deliberately stays session-less (see its own comment:
 * reading cookies() there once broke static rendering for every guest
 * guidebook page), so this can't take the calling user's ownerId as a
 * parameter even on the rare page where one would be available.
 */
export const getCachedActiveSkinId = unstable_cache(
  async (): Promise<SkinId> => {
    const ownerId = await getDefaultOwnerId();
    const settings = await prisma.settings.upsert({ where: { ownerId: ownerId! }, update: {}, create: { ownerId: ownerId! } });
    const today = manilaDayStart();
    return resolveActiveSkinId(settings.activeSeasonalSkinId, { month: today.getUTCMonth() + 1, day: today.getUTCDate() });
  },
  ["active-skin-id"],
  // Tagged (unlike getCachedBookingSettings above) so /api/settings can
  // revalidateTag("active-skin-id") on save — the skin spec explicitly
  // calls for manual activation to apply "immediately", not after up to a
  // minute's staleness like a rate change can tolerate.
  { revalidate: 60, tags: ["active-skin-id"] }
);
