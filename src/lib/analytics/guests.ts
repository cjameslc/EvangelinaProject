import { collectedAmountCentavos } from "@/lib/finance";

export type GuestBooking = {
  guestId: string | null;
  contactNumber: string;
  cancelledAt?: string | Date | null;
};

export type GuestRepeatRateResult = {
  repeatRatePct: number;
  newGuestCount: number;
  returningGuestCount: number;
  basis: "guestId+phone";
};

/**
 * Repeat-guest rate within the given booking set. `Booking.guestId` is only
 * ever set for bookings made through the Guest Portal — this business's
 * history is overwhelmingly staff-entered, so identity also falls back to
 * `contactNumber` as a best-effort proxy (a reused phone number likely
 * means the same guest, though it's a heuristic, not exact identity — two
 * different guests sharing a household landline would be miscounted as
 * one repeat guest, for example). The `basis` field is returned so the UI
 * can caption this honestly rather than presenting it as exact.
 */
export function guestRepeatRate(bookings: GuestBooking[]): GuestRepeatRateResult {
  const active = bookings.filter((b) => !b.cancelledAt);
  const countByKey = new Map<string, number>();
  for (const b of active) {
    const key = b.guestId ?? (b.contactNumber?.trim() ? `phone:${b.contactNumber.trim()}` : null);
    if (!key) continue;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }
  let newGuestCount = 0;
  let returningGuestCount = 0;
  for (const count of countByKey.values()) {
    if (count > 1) returningGuestCount++;
    else newGuestCount++;
  }
  const totalGuests = newGuestCount + returningGuestCount;
  const repeatRatePct = totalGuests > 0 ? Math.round((returningGuestCount / totalGuests) * 100) : 0;
  return { repeatRatePct, newGuestCount, returningGuestCount, basis: "guestId+phone" };
}

export type GuestValueBooking = {
  guestId: string | null;
  contactNumber: string;
  guests: string[];
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
  refundedAt?: string | Date | null;
};

export type GuestValueRow = { key: string; name: string; totalCentavos: number; bookingCount: number };

function guestKeyAndName(b: GuestValueBooking): { key: string; name: string } | null {
  const key = b.guestId ?? (b.contactNumber?.trim() ? `phone:${b.contactNumber.trim()}` : null);
  if (!key) return null;
  return { key, name: b.guests?.[0] || b.contactNumber || "Guest" };
}

/**
 * Lifetime value per guest — deliberately NOT scoped to the filter bar's
 * selected period (the name says "lifetime"), so callers should pass in
 * ALL of a guest's bookings, not just the current period's. Same
 * guestId+phone identity basis as guestRepeatRate, same caveat about it
 * being a heuristic for staff-entered bookings.
 */
export function guestLifetimeValue(bookings: GuestValueBooking[]): GuestValueRow[] {
  const rows = new Map<string, GuestValueRow>();
  for (const b of bookings) {
    const collectedTotal = collectedAmountCentavos(b);
    if (b.cancelledAt && collectedTotal === 0) continue;
    const id = guestKeyAndName(b);
    if (!id) continue;
    const row = rows.get(id.key) ?? { key: id.key, name: id.name, totalCentavos: 0, bookingCount: 0 };
    row.totalCentavos += collectedTotal;
    row.bookingCount += 1;
    rows.set(id.key, row);
  }
  return [...rows.values()].sort((a, b) => b.totalCentavos - a.totalCentavos);
}

/** Top N guests by lifetime value. */
export function topGuests(bookings: GuestValueBooking[], limit = 10): GuestValueRow[] {
  return guestLifetimeValue(bookings).slice(0, limit);
}

/** Frequent guests — top N by booking count instead of spend (a guest who books often at a lower rate vs. one big spender are different kinds of "valuable"). */
export function frequentGuests(bookings: GuestValueBooking[], limit = 10): GuestValueRow[] {
  return [...guestLifetimeValue(bookings)].sort((a, b) => b.bookingCount - a.bookingCount).slice(0, limit);
}

export type PaxBooking = { pax: number | null; cancelledAt?: string | Date | null };

/** Average guests per booking — Booking.pax is optional (staff don't always log it), so only bookings with a real pax value factor into the average, rather than treating a missing value as 0. */
export function avgGuestsPerBooking(bookings: PaxBooking[]): number {
  const withPax = bookings.filter((b) => !b.cancelledAt && b.pax != null);
  if (withPax.length === 0) return 0;
  const total = withPax.reduce((s, b) => s + (b.pax as number), 0);
  return Math.round((total / withPax.length) * 10) / 10;
}
