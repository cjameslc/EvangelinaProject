import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * booking-quote and guest/bookings are the most frequently hit routes in
 * the app (every availability search, every booking submit), but Settings
 * (rates, dpFee) only ever changes when an Admin edits it. Cached for 60s
 * — same revalidate window Dashboard/Analytics already use — so a rate
 * change still shows up within a minute without a DB round trip on every
 * single quote.
 */
export const getCachedBookingSettings = unstable_cache(
  async () => prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ["booking-settings"],
  { revalidate: 60 }
);
