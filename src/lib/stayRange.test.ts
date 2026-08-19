import { describe, it, expect } from "vitest";
import { bookingsConflict, getOccupiedWindow, windowsOverlap, checkoutDisplayDay, lastOccupiedDay, minutesLateFor } from "./stayRange";

// Booking dates in this app are stored as UTC-field timestamps that
// represent Asia/Manila wall-clock time (see stayRange.ts's
// combineDateAndTime / setUTCHours) — tests build dates the same way so
// "2:00 PM" here means the same wall-clock 2:00 PM the real app means.
function day(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}
function hhmm(h: number, m = 0) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

describe("bookingsConflict — real check-in/check-out overlap, not booking type", () => {
  it("rejects two overlapping bookings of the SAME stay type (Example 1)", () => {
    // Existing: Aug 10 2:00 PM -> Aug 11 11:00 AM
    const existing = { stayType: "Night", date: day("2026-08-10"), checkOutDate: day("2026-08-11"), checkInTime: hhmm(14), checkOutTime: hhmm(11) };
    // New: Aug 10 8:00 PM -> Aug 11 8:00 AM
    const next = { stayType: "Night", date: day("2026-08-10"), checkOutDate: day("2026-08-11"), checkInTime: hhmm(20), checkOutTime: hhmm(8) };
    expect(bookingsConflict(existing, next)).toBe(true);
  });

  it("allows two same-day bookings that genuinely don't overlap (Example 2)", () => {
    // Existing: Aug 10 8:00 AM -> Aug 10 8:00 PM (Daycation)
    const existing = { stayType: "Daycation", date: day("2026-08-10"), checkOutDate: null, checkInTime: hhmm(8), checkOutTime: hhmm(20) };
    // New: Aug 10 9:00 PM -> Aug 11 8:00 AM (Night, starts after the Daycation ends)
    const next = { stayType: "Night", date: day("2026-08-10"), checkOutDate: day("2026-08-11"), checkInTime: hhmm(21), checkOutTime: hhmm(8) };
    expect(bookingsConflict(existing, next)).toBe(false);
  });

  it("rejects overlapping bookings of DIFFERENT stay types (Example 3) — the core reported bug", () => {
    // Existing: Daycation 8:00 AM -> 5:00 PM
    const existing = { stayType: "Daycation", date: day("2026-08-10"), checkOutDate: null, checkInTime: hhmm(8), checkOutTime: hhmm(17) };
    // New: Overnight 2:00 PM -> 11:00 AM next day — overlaps 2pm-5pm
    const next = { stayType: "Night", date: day("2026-08-10"), checkOutDate: day("2026-08-11"), checkInTime: hhmm(14), checkOutTime: hhmm(11) };
    expect(bookingsConflict(existing, next)).toBe(true);
  });

  it("allows a Daycation right after an Overnight checks out, even different types (Example 4)", () => {
    // Existing: Overnight 2:00 PM Aug 10 -> 11:00 AM Aug 11
    const existing = { stayType: "Night", date: day("2026-08-10"), checkOutDate: day("2026-08-11"), checkInTime: hhmm(14), checkOutTime: hhmm(11) };
    // New: Daycation 12:00 PM -> 5:00 PM on Aug 11 (the checkout day)
    const next = { stayType: "Daycation", date: day("2026-08-11"), checkOutDate: null, checkInTime: hhmm(12), checkOutTime: hhmm(17) };
    expect(bookingsConflict(existing, next)).toBe(false);
  });

  it("rejects overlap even using each stay type's DEFAULT times (no explicit times set)", () => {
    // Daycation default 08:00-20:00, Night default 14:00-12:00(next day) —
    // these genuinely overlap 14:00-20:00 even with nothing customized.
    const existing = { stayType: "Daycation", date: day("2026-08-10"), checkOutDate: null };
    const next = { stayType: "Night", date: day("2026-08-10"), checkOutDate: null };
    expect(bookingsConflict(existing, next)).toBe(true);
  });

  it("Full stay blocks every night it spans, mid-range", () => {
    // Existing: Full stay Aug 10 -> Aug 15
    const existing = { stayType: "Full", date: day("2026-08-10"), checkOutDate: day("2026-08-15"), checkInTime: hhmm(14), checkOutTime: hhmm(12) };
    // New: a single Night on Aug 12, well inside the range
    const next = { stayType: "Night", date: day("2026-08-12"), checkOutDate: day("2026-08-13"), checkInTime: hhmm(14), checkOutTime: hhmm(11) };
    expect(bookingsConflict(existing, next)).toBe(true);
  });

  it("allows a booking starting exactly when a multi-day stay checks out", () => {
    // Existing: Full stay Aug 10 2PM -> Aug 15 12PM
    const existing = { stayType: "Full", date: day("2026-08-10"), checkOutDate: day("2026-08-15"), checkInTime: hhmm(14), checkOutTime: hhmm(12) };
    // New: check-in exactly at noon Aug 15 (the moment the prior guest checks out)
    const next = { stayType: "Night", date: day("2026-08-15"), checkOutDate: day("2026-08-16"), checkInTime: hhmm(12), checkOutTime: hhmm(11) };
    expect(bookingsConflict(existing, next)).toBe(false);
  });

  it("rejects when the new check-in is one minute before the prior checkout", () => {
    const existing = { stayType: "Full", date: day("2026-08-10"), checkOutDate: day("2026-08-15"), checkInTime: hhmm(14), checkOutTime: hhmm(12) };
    const next = { stayType: "Night", date: day("2026-08-15"), checkOutDate: day("2026-08-16"), checkInTime: hhmm(11, 59), checkOutTime: hhmm(11) };
    expect(bookingsConflict(existing, next)).toBe(true);
  });

  it("handles an overnight window crossing midnight correctly (checkout time numerically earlier than check-in)", () => {
    // Two identical 6pm -> 5am Flexible bookings on the same nominal day must conflict.
    const a = { stayType: "Flexible", date: day("2026-08-10"), checkOutDate: null, checkInTime: hhmm(18), checkOutTime: hhmm(5) };
    const b = { stayType: "Flexible", date: day("2026-08-10"), checkOutDate: null, checkInTime: hhmm(18), checkOutTime: hhmm(5) };
    expect(bookingsConflict(a, b)).toBe(true);
  });

  it("does not conflict with itself-shaped bookings on genuinely separate days", () => {
    const a = { stayType: "Daycation", date: day("2026-08-10"), checkOutDate: null, checkInTime: hhmm(8), checkOutTime: hhmm(17) };
    const b = { stayType: "Daycation", date: day("2026-08-11"), checkOutDate: null, checkInTime: hhmm(8), checkOutTime: hhmm(17) };
    expect(bookingsConflict(a, b)).toBe(false);
  });
});

describe("getOccupiedWindow — real timestamps derived from stay type defaults or explicit times", () => {
  it("uses the stay type's default times when none are recorded", () => {
    const w = getOccupiedWindow({ stayType: "Night", date: day("2026-08-10"), checkOutDate: null });
    expect(w.start.toISOString()).toBe("2026-08-10T14:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-08-11T12:00:00.000Z");
  });

  it("prefers explicit checkInTime/checkOutTime over the stay type default", () => {
    const w = getOccupiedWindow({ stayType: "Night", date: day("2026-08-10"), checkOutDate: day("2026-08-11"), checkInTime: hhmm(15), checkOutTime: hhmm(10) });
    expect(w.start.toISOString()).toBe("2026-08-10T15:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-08-11T10:00:00.000Z");
  });

  it("uses Airbnb's 2pm/11am standard for Airbnb-platform bookings with no explicit times", () => {
    const w = getOccupiedWindow({ stayType: "Night", date: day("2026-08-10"), checkOutDate: null, platform: "Airbnb" });
    expect(w.start.toISOString()).toBe("2026-08-10T14:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-08-11T11:00:00.000Z");
  });
});

describe("windowsOverlap — the true overlap predicate the spec asks for", () => {
  it("New check-in < Existing check-out AND New check-out > Existing check-in => overlap", () => {
    const existing = { start: new Date("2026-08-10T14:00:00Z"), end: new Date("2026-08-11T11:00:00Z") };
    const next = { start: new Date("2026-08-10T20:00:00Z"), end: new Date("2026-08-11T08:00:00Z") };
    expect(windowsOverlap(existing, next)).toBe(true);
  });

  it("touching but not overlapping windows (back-to-back) do not overlap", () => {
    const existing = { start: new Date("2026-08-10T14:00:00Z"), end: new Date("2026-08-11T11:00:00Z") };
    const next = { start: new Date("2026-08-11T11:00:00Z"), end: new Date("2026-08-11T17:00:00Z") };
    expect(windowsOverlap(existing, next)).toBe(false);
  });
});

// Regression coverage for a real production incident, in two parts:
// THE-4UB8X6 (a midnight checkout displayed one day early in the Bookings
// tab) was fixed by reading window.end through what's now checkoutDisplayDay
// instead of lastOccupiedDay. That fix was then itself verified with a test
// script using the wrong timezone (UTC instead of Asia/Manila), which
// missed a real double-timezone-shift regression it introduced: any
// checkout at or after 16:00 (4pm) — e.g. a same-day Daycation checking out
// at 8pm — rendered as the NEXT calendar day (EVA-BRFSWK). Both incidents
// trace back to the same underlying fact this suite exists to pin down:
// getOccupiedWindow()'s end timestamp is a UTC-labeled placeholder for
// Asia/Manila wall-clock time, not a real UTC instant — so it must never be
// passed through a genuine timezone conversion (e.g. an Intl formatter with
// timeZone: "Asia/Manila"). checkoutDisplayDay() returns a bare
// UTC-midnight Date specifically so it CAN safely go through one afterward
// (mirroring how a bare `date`/`checkOutDate` field always could) — see
// BookingsView.tsx's effectiveRange(), the real caller this guards.
describe("checkoutDisplayDay — the literal checkout day, not the last-occupied day", () => {
  // Mirrors BookingsView.tsx's dayOf() exactly — a real Asia/Manila
  // conversion, deliberately applied only to checkoutDisplayDay()'s output
  // (safe, bare UTC midnight), never to window.end directly (unsafe).
  const manilaDayOf = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

  it("THE-4UB8X6: a midnight checkout displays as the checkout day, not the check-in day", () => {
    const window = getOccupiedWindow({ stayType: "Night", date: day("2026-08-23"), checkOutDate: day("2026-08-24"), checkInTime: hhmm(12), checkOutTime: hhmm(0) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2026-08-24");
  });

  it("EVA-BRFSWK: a same-day Daycation checking out at 8pm stays on its own day (the regression case)", () => {
    const window = getOccupiedWindow({ stayType: "Daycation", date: day("2026-08-21"), checkOutDate: day("2026-08-21"), checkInTime: hhmm(8), checkOutTime: hhmm(20) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2026-08-21");
  });

  it("the 4pm boundary itself does not roll over", () => {
    const window = getOccupiedWindow({ stayType: "Daycation", date: day("2026-08-21"), checkOutDate: day("2026-08-21"), checkInTime: hhmm(8), checkOutTime: hhmm(16) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2026-08-21");
  });

  it("one minute past the 4pm boundary does not roll over", () => {
    const window = getOccupiedWindow({ stayType: "Daycation", date: day("2026-08-21"), checkOutDate: day("2026-08-21"), checkInTime: hhmm(8), checkOutTime: hhmm(16, 1) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2026-08-21");
  });

  it("11:59pm same-day checkout does not roll over", () => {
    const window = getOccupiedWindow({ stayType: "Daycation", date: day("2026-08-21"), checkOutDate: day("2026-08-21"), checkInTime: hhmm(8), checkOutTime: hhmm(23, 59) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2026-08-21");
  });

  it("a genuine overnight stay (Night, next-day morning checkout) still shows the next day", () => {
    const window = getOccupiedWindow({ stayType: "Night", date: day("2026-08-21"), checkOutDate: day("2026-08-22"), checkInTime: hhmm(20), checkOutTime: hhmm(8) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2026-08-22");
  });

  it("a multi-night stay shows its real checkout day, not the check-in day", () => {
    const window = getOccupiedWindow({ stayType: "Full", date: day("2026-08-23"), checkOutDate: day("2026-08-26"), checkInTime: hhmm(14), checkOutTime: hhmm(12) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2026-08-26");
  });

  it("a year-boundary overnight checkout rolls the calendar year forward correctly", () => {
    const window = getOccupiedWindow({ stayType: "Night", date: day("2026-12-31"), checkOutDate: day("2027-01-01"), checkInTime: hhmm(20), checkOutTime: hhmm(0) });
    expect(manilaDayOf(checkoutDisplayDay(window))).toBe("2027-01-01");
  });

  it("agrees with lastOccupiedDay for every checkout time except exactly midnight", () => {
    // Non-midnight: both functions land on the same UTC calendar day (they
    // only diverge on the exact-midnight case, which each has its own
    // dedicated test above/below) — this is the "strict fix, not a
    // behavior change" guarantee for the common case.
    const window = getOccupiedWindow({ stayType: "Daycation", date: day("2026-08-21"), checkOutDate: day("2026-08-21"), checkInTime: hhmm(8), checkOutTime: hhmm(20) });
    expect(checkoutDisplayDay(window).toISOString()).toBe(lastOccupiedDay(window).toISOString());
  });

  it("diverges from lastOccupiedDay by design on the exact-midnight case", () => {
    const window = getOccupiedWindow({ stayType: "Night", date: day("2026-08-23"), checkOutDate: day("2026-08-24"), checkInTime: hhmm(12), checkOutTime: hhmm(0) });
    expect(checkoutDisplayDay(window).toISOString()).not.toBe(lastOccupiedDay(window).toISOString());
  });
});

// Regression coverage for a real bug found while centralizing the
// tardiness calculation that used to be hand-duplicated (and independently
// wrong) in two API routes: comparing a real `startedAt` timestamp against
// a hand-built "scheduled checkout" that was never converted to a real UTC
// instant meant a housekeeper starting a genuine 1-7 real hours late was
// reported as perfectly on time — tardiness only registered at all past 8
// real hours late, under-reporting the true delay by exactly that much.
describe("minutesLateFor — real elapsed time, not a raw placeholder subtraction", () => {
  const daycation = { stayType: "Daycation", date: day("2026-08-21"), checkOutDate: day("2026-08-21"), checkInTime: hhmm(8), checkOutTime: hhmm(20) };

  it("null (on time) 5 minutes before the real scheduled checkout (12:00 UTC = 8pm Manila)", () => {
    expect(minutesLateFor(daycation, new Date("2026-08-21T11:55:00Z"))).toBeNull();
  });

  it("null (within the 10-minute grace) 5 minutes after the real scheduled checkout", () => {
    expect(minutesLateFor(daycation, new Date("2026-08-21T12:05:00Z"))).toBeNull();
  });

  it("flags a real 1-hour-late start as ~50 minutes late (60 - 10 grace) — was silently on-time before this fix", () => {
    expect(minutesLateFor(daycation, new Date("2026-08-21T13:00:00Z"))).toBe(50);
  });

  it("flags a real 3-hour-late start correctly — was silently on-time before this fix", () => {
    expect(minutesLateFor(daycation, new Date("2026-08-21T15:00:00Z"))).toBe(170); // 180 - 10 grace
  });

  it("a Daycation with no recorded checkOutTime uses the Daycation default (20:00), not a hardcoded noon", () => {
    const noTime = { stayType: "Daycation", date: day("2026-08-21"), checkOutDate: day("2026-08-21"), checkInTime: null, checkOutTime: null };
    // Real scheduled checkout defaults to 20:00 Manila = 12:00 UTC, same as the explicit-time case above.
    expect(minutesLateFor(noTime, new Date("2026-08-21T11:55:00Z"))).toBeNull();
    expect(minutesLateFor(noTime, new Date("2026-08-21T13:00:00Z"))).toBe(50);
  });

  it("an implausible outlier (a stray multi-day-old mis-paired booking) is excluded, not clamped", () => {
    expect(minutesLateFor(daycation, new Date("2026-08-25T12:00:00Z"), 24 * 3600 * 1000)).toBeNull();
  });

  it("an overnight stay's real scheduled checkout is its real next-morning instant", () => {
    const overnight = { stayType: "Night", date: day("2026-08-21"), checkOutDate: day("2026-08-22"), checkInTime: hhmm(20), checkOutTime: hhmm(8) };
    // Real checkout: 8am Manila Aug22 = 00:00 UTC Aug22.
    expect(minutesLateFor(overnight, new Date("2026-08-21T23:55:00Z"))).toBeNull();
    expect(minutesLateFor(overnight, new Date("2026-08-22T01:00:00Z"))).toBe(50);
  });
});
