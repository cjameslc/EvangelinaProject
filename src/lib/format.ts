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

export function peso(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  return "₱" + v.toLocaleString("en-PH");
}

/** Formats an integer centavo amount (e.g. 1830026) as a peso string with cents ("₱18,300.26"). */
export function pesoCentavos(centavos: number | null | undefined): string {
  const v = centavos ?? 0;
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
