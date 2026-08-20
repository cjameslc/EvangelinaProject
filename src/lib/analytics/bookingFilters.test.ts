import { describe, expect, it } from "vitest";
import { applyBookingFilters, classifyBookingStatus, hasActiveBookingFilters, type FilterableBooking } from "./bookingFilters";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function booking(overrides: Partial<FilterableBooking>): FilterableBooking {
  return { bookerId: "emp-1", platform: "Direct", stayType: "Full", cancelledAt: null, date: day("2026-08-01"), checkOutDate: day("2026-08-02"), ...overrides };
}

describe("applyBookingFilters", () => {
  it("returns the input completely unchanged when no filters are set — the safety property every existing section relies on", () => {
    const bookings = [booking({}), booking({ bookerId: "emp-2" })];
    expect(applyBookingFilters(bookings, {})).toEqual(bookings);
    expect(applyBookingFilters(bookings, { bookerIds: [], platforms: [], stayTypes: [], statuses: [] })).toEqual(bookings);
  });

  it("filters by bookerId, excluding unattributed bookings", () => {
    const bookings = [booking({ bookerId: "emp-1" }), booking({ bookerId: "emp-2" }), booking({ bookerId: null })];
    const result = applyBookingFilters(bookings, { bookerIds: ["emp-1"] });
    expect(result).toHaveLength(1);
    expect(result[0].bookerId).toBe("emp-1");
  });

  it("filters by platform", () => {
    const bookings = [booking({ platform: "Airbnb" }), booking({ platform: "TikTok" })];
    const result = applyBookingFilters(bookings, { platforms: ["Airbnb"] });
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("Airbnb");
  });

  it("filters by stay type", () => {
    const bookings = [booking({ stayType: "Daycation" }), booking({ stayType: "Full" })];
    const result = applyBookingFilters(bookings, { stayTypes: ["Daycation"] });
    expect(result).toHaveLength(1);
  });

  it("combines multiple filters as AND, not OR", () => {
    const bookings = [
      booking({ bookerId: "emp-1", platform: "Airbnb" }),
      booking({ bookerId: "emp-1", platform: "TikTok" }),
      booking({ bookerId: "emp-2", platform: "Airbnb" }),
    ];
    const result = applyBookingFilters(bookings, { bookerIds: ["emp-1"], platforms: ["Airbnb"] });
    expect(result).toHaveLength(1);
    expect(result[0].bookerId).toBe("emp-1");
    expect(result[0].platform).toBe("Airbnb");
  });

  it("filters by status using the real lifecycle classification, not a raw column", () => {
    const now = day("2026-08-15");
    const bookings = [
      booking({ date: day("2026-08-20") }), // upcoming
      booking({ date: day("2026-08-01"), checkOutDate: day("2026-08-02") }), // completed (well in the past)
      booking({ cancelledAt: day("2026-08-10") }), // cancelled
    ];
    const upcoming = applyBookingFilters(bookings, { statuses: ["upcoming"] }, now);
    expect(upcoming).toHaveLength(1);
    const cancelled = applyBookingFilters(bookings, { statuses: ["cancelled"] }, now);
    expect(cancelled).toHaveLength(1);
  });
});

describe("classifyBookingStatus", () => {
  const now = day("2026-08-15");

  it("cancelled takes precedence over every other state", () => {
    const b = booking({ cancelledAt: day("2026-08-01"), date: day("2026-08-01"), checkOutDate: day("2026-08-02") });
    expect(classifyBookingStatus(b, now)).toBe("cancelled");
  });

  it("a stay that fully completed before now is 'completed'", () => {
    const b = booking({ date: day("2026-08-01"), checkOutDate: day("2026-08-02") });
    expect(classifyBookingStatus(b, now)).toBe("completed");
  });

  it("a future check-in is 'upcoming'", () => {
    const b = booking({ date: day("2026-08-20"), checkOutDate: day("2026-08-21") });
    expect(classifyBookingStatus(b, now)).toBe("upcoming");
  });
});

describe("hasActiveBookingFilters", () => {
  it("is false when nothing is set", () => {
    expect(hasActiveBookingFilters({})).toBe(false);
    expect(hasActiveBookingFilters({ bookerIds: [], platforms: [] })).toBe(false);
  });
  it("is true when any one filter has values", () => {
    expect(hasActiveBookingFilters({ bookerIds: ["emp-1"] })).toBe(true);
  });
});
