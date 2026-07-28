// Per-unit, per-date, per-stay-type "is this still bookable" — the real
// data behind the Social Media Center's promotional cards. Reuses
// bookingsConflict() (the exact same rule the booking form's live conflict
// check and the create/edit API's overlap guard already enforce) rather
// than a second, looser definition of "open" — so a date this module calls
// bookable is always genuinely bookable, never a false promise to a guest
// who messages in response to a post.
import { bookingsConflict } from "@/lib/stayRange";
import { quotePrice, type RateTable } from "@/lib/pricing/rates";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

export const PROMOTABLE_STAY_TYPES: StayType[] = ["Daycation", "Night", "Full"];

type MinimalBooking = {
  unitId: string;
  date: string | Date;
  checkOutDate: string | Date | null;
  stayType: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  cancelledAt?: string | Date | null;
};

export type DayOpportunity = {
  iso: string;
  openStayTypes: StayType[];
  price: Partial<Record<StayType, number>>; // real quoted price for each open stay type, weekday/weekend-aware
};

export type UnitOpportunity = {
  unitId: string;
  days: DayOpportunity[];
};

/** Every ISO date string from `startIso` through `endIso` inclusive. */
export function isoRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

/**
 * For one unit, over a list of candidate dates: which stay types could
 * actually be booked on each date right now (structurally — not blocked by
 * any existing non-cancelled booking on that unit), with a real quoted
 * price for each. A day with zero open stay types is fully booked for that
 * unit; a day open for Daycation but not Night (or vice versa) is exactly
 * the "opportunity" a promo post should call out by name rather than a
 * generic "Available."
 */
export function computeUnitOpportunities(
  unitId: string,
  bookings: MinimalBooking[],
  dates: string[],
  rates: RateTable,
  dpFee: number
): UnitOpportunity {
  const unitBookings = bookings.filter((b) => b.unitId === unitId && !b.cancelledAt);
  const days: DayOpportunity[] = dates.map((iso) => {
    const candidateDate = new Date(`${iso}T00:00:00Z`);
    const openStayTypes: StayType[] = [];
    const price: Partial<Record<StayType, number>> = {};
    for (const stayType of PROMOTABLE_STAY_TYPES) {
      const conflicts = unitBookings.some((b) =>
        bookingsConflict(
          { stayType, date: candidateDate, checkOutDate: null },
          { stayType: b.stayType, date: new Date(b.date), checkOutDate: b.checkOutDate ? new Date(b.checkOutDate) : null, checkInTime: b.checkInTime, checkOutTime: b.checkOutTime }
        )
      );
      if (!conflicts) {
        openStayTypes.push(stayType);
        price[stayType] = quotePrice(stayType, candidateDate, null, rates, dpFee).total;
      }
    }
    return { iso, openStayTypes, price };
  });
  return { unitId, days };
}

/** Collapses a sorted list of ISO dates into human-friendly ranges, e.g. ["2026-07-29","2026-07-30"] -> ["Jul 29-30"]. */
export function summarizeIsoDates(isos: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < isos.length) {
    let j = i;
    while (j + 1 < isos.length && new Date(isos[j + 1]).getTime() - new Date(isos[j]).getTime() === 86400000) j++;
    const startD = new Date(`${isos[i]}T00:00:00Z`);
    const endD = new Date(`${isos[j]}T00:00:00Z`);
    const fmt = (d: Date, withMonth = true) => d.toLocaleDateString("en-US", { month: withMonth ? "short" : undefined, day: "numeric", timeZone: "UTC" });
    out.push(i === j ? fmt(startD) : `${fmt(startD)}-${fmt(endD, false)}`);
    i = j + 1;
  }
  return out;
}

/** Per-stay-type open-date summary for one unit, e.g. { Daycation: ["Jul 29-30"], Night: ["Jul 28"], Full: [] }. */
export function groupOpenDatesByStayType(days: DayOpportunity[]): Record<StayType, string[]> {
  const result = {} as Record<StayType, string[]>;
  for (const stayType of PROMOTABLE_STAY_TYPES) {
    const isos = days.filter((d) => d.openStayTypes.includes(stayType)).map((d) => d.iso);
    result[stayType] = summarizeIsoDates(isos);
  }
  return result;
}

/**
 * Cheapest real quoted price per stay type across a unit's open days, e.g.
 * { Daycation: 1499, Night: 1349, Full: 1899 } — Night's own number already
 * reflects the weekday-night promo when applicable (quotePrice bakes that
 * in), it's just never blended across stay types. Previously the Content
 * Studio card/export only showed ONE blended "From ₱X" (the minimum across
 * every stay type AND day), which could surface a promo-discounted Night
 * price under a generic "From" label with no indication it was Night-only
 * — a real, confirmed source of confusion, not just a cosmetic nitpick.
 */
export function pricesByStayType(days: DayOpportunity[]): Partial<Record<StayType, number>> {
  const result: Partial<Record<StayType, number>> = {};
  for (const day of days) {
    for (const [stayType, price] of Object.entries(day.price) as [StayType, number][]) {
      if (result[stayType] === undefined || price < result[stayType]!) result[stayType] = price;
    }
  }
  return result;
}

/**
 * Simple, deterministic rules over real numbers — not an AI call. Every
 * suggestion here is a direct readout of the actual computed opportunity
 * data (never a guess), matching the same "no invention" discipline the AI
 * copy generator follows.
 */
export function computeMarketingSuggestions(
  opportunities: { unitId: string; unitLabel: string; days: DayOpportunity[] }[],
  todayIso: string
): string[] {
  const suggestions: string[] = [];

  const openToday = opportunities.filter((o) => o.days.find((d) => d.iso === todayIso)?.openStayTypes.length);
  if (openToday.length === 1) {
    suggestions.push(`Only ${openToday[0].unitLabel} is open today — a good moment to promote urgency.`);
  } else if (openToday.length === 0 && opportunities.length > 0) {
    suggestions.push(`Every unit is booked today — a "fully booked" or waitlist post fits better than an availability push.`);
  }

  const totalOpenDays = opportunities.map((o) => ({ unit: o, count: o.days.filter((d) => d.openStayTypes.length > 0).length }));
  const mostOpen = totalOpenDays.slice().sort((a, b) => b.count - a.count)[0];
  if (mostOpen && mostOpen.count > 0 && totalOpenDays.length > 1) {
    suggestions.push(`${mostOpen.unit.unitLabel} has the most open dates (${mostOpen.count}) — the best candidate to promote first.`);
  }

  const totalOpenAcrossAll = totalOpenDays.reduce((s, o) => s + o.count, 0);
  const totalSlotsAcrossAll = opportunities.reduce((s, o) => s + o.days.length, 0);
  if (totalSlotsAcrossAll > 0) {
    const openRatio = totalOpenAcrossAll / totalSlotsAcrossAll;
    if (openRatio > 0.5) {
      suggestions.push(`Occupancy looks light across this window (${Math.round((1 - openRatio) * 100)}% booked) — a limited-time promo could help fill it.`);
    } else if (openRatio < 0.15) {
      suggestions.push(`This window is nearly fully booked (${Math.round((1 - openRatio) * 100)}%) — lean into scarcity/urgency messaging rather than a broad availability post.`);
    }
  }

  return suggestions;
}
