import { prisma } from "@/lib/prisma";
import { STAY_TYPES } from "@/lib/constants";
import { getGuestBookings } from "@/lib/bookingEngine/guestService";
import { getPublicOccupiedDatesForUnits } from "@/lib/bookingEngine/calendarService";
import { getGuidebookSettings } from "@/lib/guidebookService";

/**
 * Everything the assistant is allowed to know, gathered fresh from the real
 * database. The door code and WiFi password themselves are NEVER included
 * here — only a boolean hasWifi/hasDoorCode per active booking — so the
 * chat can correctly tell a guest whether their unit has one on file
 * without being able to just state it in a reply. The actual reveal always
 * goes through the same re-enter-your-booking-ID gate as the WiFi/Check-in
 * Guide pages (SecureWifiCard/SecureDoorCodeCard, /api/guest/wifi,
 * /api/guest/door-code) — a signed-in session alone was never meant to be
 * enough on its own, and the chat shouldn't be a side door around that.
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
  const [occupancy, guidebook] = await Promise.all([
    getPublicOccupiedDatesForUnits(units.map((u) => u.id), now, in30Days),
    getGuidebookSettings(),
  ]);

  const bookings = guestId ? await getGuestBookings(guestId) : [];
  const activeBookingUnitIds = [...new Set(bookings.filter((b) => !b.cancelledAt).map((b) => b.unitId))];
  const guideUnits = activeBookingUnitIds.length
    ? await prisma.unit.findMany({
        where: { id: { in: activeBookingUnitIds } },
        select: { id: true, wifiSsid: true, wifiPassword: true, doorCode: true, checkInInstructions: true },
      })
    : [];
  // wifiSsid/wifiPassword/doorCode are selected above only to derive the
  // booleans below — the raw values are deliberately never assigned onto
  // the returned context (see the function's doc comment).
  const guideUnitById = new Map(guideUnits.map((u) => [u.id, u]));

  return {
    stayTypes: Object.entries(STAY_TYPES)
      .filter(([k]) => k !== "Cleaning" && k !== "Maintenance")
      .map(([k, v]) => ({ type: k, label: v.label, duration: v.hrs })),
    units: units.map((u) => ({ shortName: u.shortName, unitNumber: u.unitNumber, location: u.location, nightlyRate: u.nightlyRate, rating: u.rating })),
    occupiedNext30Days: occupancy,
    guestBookings: bookings.map((b) => {
      const guide = guideUnitById.get(b.unitId);
      return {
        id: b.id, unit: b.unit.shortName, date: b.date, checkOutDate: b.checkOutDate, stayType: b.stayType,
        amount: b.amount, paid: b.paid, cancelledAt: b.cancelledAt,
        // Whether one exists — never the value itself. Only true when this
        // specific booking is active (guide is only populated for active-
        // booking unit ids above).
        hasWifi: !!(guide?.wifiSsid && guide?.wifiPassword),
        hasDoorCode: !!guide?.doorCode,
        checkInInstructions: guide?.checkInInstructions ?? null,
      };
    }),
    // General area/amenity info — safe to share with anyone, signed in or
    // not, same as a printed guidebook in the unit would be.
    guidebook: {
      amenities: guidebook.amenities.map((a) => a.label),
      houseRules: guidebook.houseRules,
      nearbyPlaces: guidebook.categories.map((c) => ({ category: c.label, places: c.items })),
      contactPhone: guidebook.contactPhone,
      emergencyContactPhone: guidebook.emergencyContactPhone,
    },
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
