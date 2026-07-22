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
