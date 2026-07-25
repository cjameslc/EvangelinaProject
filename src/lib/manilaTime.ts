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
