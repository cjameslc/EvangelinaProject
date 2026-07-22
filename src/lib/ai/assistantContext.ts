import { prisma } from "@/lib/prisma";
import { STAY_TYPES } from "@/lib/constants";
import { getGuestBookings } from "@/lib/bookingEngine/guestService";
import { getPublicOccupiedDates } from "@/lib/bookingEngine/calendarService";

/**
 * Everything the assistant is allowed to know, gathered fresh from the
 * real database every request — never cached, never hardcoded. Deliberately
 * excludes anything this app has no real data for (house rules, amenities,
 * parking specifics) — see the system prompt in assistantService.ts for
 * why that's a hard boundary, not an oversight.
 */
export async function buildAssistantContext(guestId: string | null) {
  const units = await prisma.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, shortName: true, unitNumber: true, location: true, nightlyRate: true, rating: true },
  });

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86400000);
  const occupancy = await Promise.all(
    units.map(async (u) => ({ unitId: u.id, blocks: await getPublicOccupiedDates(u.id, now, in30Days) }))
  );

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
