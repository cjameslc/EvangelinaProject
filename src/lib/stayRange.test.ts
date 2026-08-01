import { describe, it, expect } from "vitest";
import { bookingsConflict, getOccupiedWindow, windowsOverlap } from "./stayRange";

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
