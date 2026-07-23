// A booking confirmation number (see confirmationNumber.ts) is meant as a
// stay-scoped access code — usable for guest login and the WiFi/door-code
// reveal gate from the moment a booking is made through the end of that
// stay, not forever. This is the single place that decides "is this code
// currently usable," so guest login (verify-confirmation), the WiFi reveal,
// and the door-code reveal can never drift out of sync with each other.

// Grace period past checkout — same-evening receipt lookups, a slightly
// late actual checkout, etc. Not a security boundary on its own (the code
// still requires knowing both the email and the code), just a sensible
// buffer before the natural window closes.
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export type ConfirmationValidityInput = {
  date: Date | string;
  checkOutDate: Date | string | null;
  cancelledAt: Date | string | null;
  confirmationOverrideUntil: Date | string | null;
};

/**
 * True from the moment a booking is created through checkOutDate (or
 * `date` for a same-day stay with no checkOutDate) plus the grace period
 * above — an extended stay's later checkOutDate is honored automatically,
 * no separate "extension" bookkeeping needed. A cancelled booking is never
 * valid. confirmationOverrideUntil, when set, is an OWNER_ADMIN's explicit
 * override and wins outright (even if it's earlier than the natural
 * window would allow, so "deactivate early" is possible too, not just
 * "reactivate").
 */
export function isConfirmationValid(booking: ConfirmationValidityInput, now: Date = new Date()): boolean {
  if (booking.cancelledAt) return false;
  if (booking.confirmationOverrideUntil != null) {
    return now <= new Date(booking.confirmationOverrideUntil);
  }
  const stayEnd = booking.checkOutDate ? new Date(booking.checkOutDate) : new Date(booking.date);
  return now.getTime() <= stayEnd.getTime() + GRACE_PERIOD_MS;
}
