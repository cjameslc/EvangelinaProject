// Business runs in Manila (UTC+8); Vercel's server functions run in UTC.
// Using new Date().getMonth()/getFullYear() server-side reads the UTC
// calendar day/month, which is wrong for up to ~8 hours around every day's
// and month's boundary (Manila has already rolled over while UTC hasn't).
// These return UTC-midnight instants standing in for the Manila calendar
// day, matching how Booking.date/Bill.month are stored — always derive
// "today" or "this month" server-side through these, never local getters.
export function manilaDayStart(d: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return new Date(`${iso}T00:00:00Z`);
}
export function manilaMonthStart(d: Date = new Date()): Date {
  const day = manilaDayStart(d);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/** Sunday-start [start, end) for the Manila week `offset` weeks from this one — the shared "this week" boundary for weekly payroll figures (Dashboard's "Your team", the Weekly report, Admin's Staff tab), so they always agree. */
export function manilaWeekRange(offset = 0, d: Date = new Date()): { start: Date; end: Date } {
  const start = manilaDayStart(d);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + offset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/** Meter Reading's target cadence (a Housekeeping compliance target, not a
 * Bill's billing cycle): every Monday (a weekly spot-check) and the 1st of
 * the month (ties to the monthly billing cycle Bills are generated for —
 * see ensureRecurringBillsForMonth). Shared by the client banner
 * (HousekeepingView) and the server-side missed-target check
 * (checkMissedMeterReadingTargets in the meters API route) so both agree
 * on exactly the same day, computed the same Manila-anchored way as every
 * other date helper here. */
export function meterReadingTargetDay(d: Date = new Date()): { isTarget: boolean; label: string | null } {
  const dayStart = manilaDayStart(d);
  if (dayStart.getUTCDate() === 1) return { isTarget: true, label: "Monthly billing cycle (1st)" };
  if (dayStart.getUTCDay() === 1) return { isTarget: true, label: "Weekly Monday check" };
  return { isTarget: false, label: null };
}

/**
 * The unit number is the primary identifier (Admin → Units is the source of
 * truth); the display name is secondary and only shown when it adds
 * information. Never render a unit by its custom name alone — two listings
 * can share a similar name, but never a unit number.
 */
export function unitLabel(unit: { unitNumber?: string | null; name?: string | null; shortName?: string | null }): string {
  const secondary = unit.shortName || unit.name;
  if (!unit.unitNumber) return secondary || "Unit";
  return secondary ? `Unit ${unit.unitNumber} · ${secondary}` : `Unit ${unit.unitNumber}`;
}

/**
 * The official, single-source-of-truth display name for each unit — "Unit
 * 1118 - Evangelina's Comfort Stay" — used for every PRIMARY unit-identity
 * display app-wide (page headings, card/row headlines, table "Unit"
 * columns, PDF/Excel exports, guest-facing pages). Looked up by unitNumber
 * alone (not the full Unit row) so it works from any call site regardless
 * of which fields that particular query happened to select — many existing
 * queries only fetch shortName, not the full name. Compact, space-limited
 * UI (filter pills, dropdown options, chart legends/ticks, small badges) is
 * explicitly exempt per the naming-convention spec and may keep using
 * unitLabel()/shortName above instead.
 */
const OFFICIAL_UNIT_NAMES: Record<string, string> = {
  "1118": "Evangelina's Comfort Stay",
  "1558": "Evangelina's Cozy City Stay",
  "1116": "Relax at Evangelina's Stay",
  "2045": "Evangelina's Signature Suites",
  "1845": "Unwind @ Evangelina's Haven",
};

export function formatUnitDisplay(unitNumber: string | null | undefined, fallbackName?: string | null): string {
  if (!unitNumber) return fallbackName || "Unit";
  const officialName = OFFICIAL_UNIT_NAMES[unitNumber] ?? fallbackName;
  return officialName ? `Unit ${unitNumber} - ${officialName}` : `Unit ${unitNumber}`;
}

export function peso(n: number | null | undefined): string {
  const v = Math.round(n ?? 0) || 0; // `|| 0` folds -0 into 0 so a value that rounds to zero never renders as "₱-0"
  return "₱" + v.toLocaleString("en-PH");
}

/** Formats an integer centavo amount (e.g. 1830026) as a peso string with cents ("₱18,300.26"). */
export function pesoCentavos(centavos: number | null | undefined): string {
  const v = (centavos ?? 0) || 0; // `|| 0` folds -0 into 0 so a value that rounds to zero never renders as "₱-0.00"
  return "₱" + (v / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A bill's due amount in centavos — reads the centavo-precise field when present (template-generated bills), otherwise derives it from the legacy whole-peso field so every bill can be summed in one consistent unit. */
export function billCentavos(bill: { amountDue: number; amountDueCentavos?: number | null }): number {
  return bill.amountDueCentavos ?? bill.amountDue * 100;
}

/** A bill's paid amount in centavos — same legacy-fallback convention as billCentavos, but only counts when the bill is actually marked paid (unpaid bills have no amountPaid). */
export function billPaidCentavos(bill: { paid: boolean; amountDue: number; amountPaid: number | null; amountDueCentavos?: number | null; amountPaidCentavos?: number | null }): number {
  if (!bill.paid) return 0;
  if (bill.amountPaidCentavos != null) return bill.amountPaidCentavos;
  if (bill.amountPaid != null) return bill.amountPaid * 100;
  return billCentavos(bill);
}

// Every call defaults to (and can only be overridden away from) Manila —
// the business has exactly one timezone, and a Date's toLocaleDateString/
// toLocaleTimeString without an explicit timeZone silently uses whatever
// zone the runtime happens to be in, which differs between a UTC server
// and a Manila client and breaks hydration for any "use client" component.
export function fmtDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...opts });
}

export function fmtTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

/**
 * Same as fmtTime, but reads the UTC clock fields instead of converting to
 * Asia/Manila — for timestamps built by stayRange.ts's getOccupiedWindow
 * (combineDateAndTime uses setUTCHours), which stores a booking's intended
 * Manila wall-clock time in the UTC fields rather than as a real UTC
 * instant. Converting those through Asia/Manila again would double-apply
 * the offset and show the wrong hour — same reason booking dates elsewhere
 * in this app are formatted with `timeZone: "UTC"` instead of fmtDate's
 * Asia/Manila default.
 */
export function fmtUtcTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-PH", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
}

/** Formats a "HH:MM" 24-hour time-input value (e.g. from <input type="time">) as "2:30 PM". */
export function fmtTimeStr(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
