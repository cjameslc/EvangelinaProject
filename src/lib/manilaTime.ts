// Small shared Asia/Manila date helpers — used by both the rate engine
// (weekday/weekend pricing) and payment verification (today's date check).
// Previously duplicated in each file; consolidated here so the two can
// never drift on what "today" or "the weekend" means.

const MANILA_WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** 0=Sun..6=Sat, evaluated on the Asia/Manila calendar day. */
export function manilaWeekdayIndex(date: Date): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short" }).format(date);
  return MANILA_WEEKDAY_INDEX[label] ?? date.getUTCDay();
}

export function isManilaWeekend(date: Date): boolean {
  const day = manilaWeekdayIndex(date);
  return day === 0 || day === 5 || day === 6; // Sun, Fri, Sat
}

/** Today's date in Asia/Manila, as YYYY-MM-DD. */
export function manilaTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/** Any given date's Asia/Manila calendar day, as YYYY-MM-DD — the general
 * form of manilaTodayISO() above, for comparing two arbitrary dates' days
 * (e.g. "is this the same calendar day as checkout?") rather than just
 * checking against today. */
export function manilaDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
}

/** True if a YYYY-MM-DD date string is strictly before today in Asia/Manila — plain string comparison works since both sides are zero-padded ISO dates. */
export function isPastManilaDate(dateStr: string): boolean {
  return dateStr < manilaTodayISO();
}

/** 0-23 hour of day in Asia/Manila — for time-of-day greetings (see
 * FestiveGreeting), evaluated against the property's own timezone rather
 * than the browser's, so a guest checking in from abroad still sees
 * "Good evening" when it's evening in Cubao. */
export function manilaHour(date: Date = new Date()): number {
  return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }).format(date), 10);
}

/** "Good morning" / "Good afternoon" / "Good evening", from the Asia/Manila hour. */
export function manilaTimeGreeting(date: Date = new Date()): string {
  const h = manilaHour(date);
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// The Philippines doesn't observe DST — a fixed offset is safe year-round.
const MANILA_UTC_OFFSET_MS = 8 * 3600 * 1000;

/**
 * Converts a "fake-UTC" Manila-wall-clock placeholder into the real UTC
 * instant it's meant to represent.
 *
 * Booking.date/checkOutDate (see manilaDayStart's doc comment in
 * format.ts) store the Manila calendar day as a UTC-midnight instant —
 * deliberately not a true UTC timestamp, just a stand-in. stayRange.ts's
 * getOccupiedWindow extends that same placeholder convention to hour/
 * minute precision (combineDateAndTime's setUTCHours(14, ...) means "2 PM
 * Manila," not "2 PM UTC"). That's harmless for this app's existing uses —
 * overlap/conflict checks and calendar day-span math only ever compare
 * these placeholders against each other, and a consistent offset cancels
 * out in every such comparison.
 *
 * It stops being harmless the moment a real-world external system needs
 * the actual instant — e.g. handing a guest's check-in/check-out window to
 * TTLock, whose lock hardware evaluates startDate/endDate against its own
 * real clock. Sending the placeholder's raw getTime() there activates the
 * passcode 8 hours late and expires it 8 hours late too — this function is
 * the one correction point for that handoff. Do NOT apply it to values
 * that stay entirely inside this app's own internal comparisons; doing so
 * would re-align only some bookings' windows and break the (consistently
 * wrong, but consistently so) relative math they rely on.
 */
export function manilaWallClockToRealInstant(d: Date): Date {
  return new Date(d.getTime() - MANILA_UTC_OFFSET_MS);
}
