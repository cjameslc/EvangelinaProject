import { prisma } from "@/lib/prisma";
import { STAY_TYPES } from "@/lib/constants";
import { getGuestBookings } from "@/lib/bookingEngine/guestService";
import { getPublicOccupiedDatesForUnits } from "@/lib/bookingEngine/calendarService";

/**
 * Everything the assistant is allowed to know, gathered fresh from the real
 * database. Deliberately excludes anything this app has no real data for
 * (house rules, amenities, parking specifics) — see the system prompt in
 * assistantService.ts for why that's a hard boundary, not an oversight.
 *
 * Never hardcoded — but IS cached briefly by getCachedAssistantContext
 * below, since a chat conversation sends several messages in quick
 * succession and rebuilding this (units + 30-day occupancy + a signed-in
 * guest's bookings) from scratch every single message is wasted DB work
 * for data that essentially never changes mid-conversation.
 */
export async function buildAssistantContext(guestId: string | null) {
  const units = await prisma.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, shortName: true, unitNumber: true, location: true, nightlyRate: true, rating: true },
  });

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86400000);
  const occupancy = await getPublicOccupiedDatesForUnits(units.map((u) => u.id), now, in30Days);

  const bookings = guestId ? await getGuestBookings(guestId) : [];

  return {
    stayTypes: Object.entries(STAY_TYPES)
      .filter(([k]) => k !== "Cleaning" && k !== "Maintenance")
      .map(([k, v]) => ({ type: k, label: v.label, duration: v.hrs })),
    units: units.map((u) => ({ shortName: u.shortName, unitNumber: u.unitNumber, location: u.location, nightlyRate: u.nightlyRate, rating: u.rating })),
    occupiedNext30Days: occupancy,
    guestBookings: bookings.map((b) => ({
      id: b.id, unit: b.unit.shortName, date: b.date, checkOutDate: b.checkOutDate, stayType: b.stayType,
      amount: b.amount, paid: b.paid, cancelledAt: b.cancelledAt,
    })),
  };
}

export type AssistantContext = Awaited<ReturnType<typeof buildAssistantContext>>;

// Best-effort, in-memory, per-instance — same reasoning as src/lib/rateLimit.ts.
// A short TTL: long enough to skip rebuilding on a rapid back-and-forth chat
// exchange, short enough that a guest who just booked/cancelled and asks the
// assistant about it right after only waits a beat for a fresh answer.
const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { context: AssistantContext; expiresAt: number }>();

export async function getCachedAssistantContext(guestId: string | null): Promise<AssistantContext> {
  const key = guestId ?? "anon";
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.context;

  const context = await buildAssistantContext(guestId);
  cache.set(key, { context, expiresAt: Date.now() + CACHE_TTL_MS });
  return context;
}
