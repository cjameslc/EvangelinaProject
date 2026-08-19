import { describe, it, expect } from "vitest";
import { isBookingCompleted, guestJourneyStage } from "./bookingStatus";

// Regression coverage for a real bug found while auditing the codebase for
// duplicated business logic: isBookingCompleted() (and, once discovered,
// guestJourneyStage() which had never received the same fix at all) both
// compared getOccupiedWindow()'s end/start against a real `now` WITHOUT
// converting through manilaWallClockToRealInstant() first. Those window
// timestamps are Asia/Manila wall-clock placeholders (an hour-of-day
// stamped onto a UTC-labeled day via setUTCHours), not real UTC instants —
// comparing one directly against a real `new Date()` (every actual caller
// in the app passes exactly that) was silently wrong by Manila's UTC+8
// offset. A Daycation checking out 8pm Manila (real instant 12:00 UTC)
// only flipped to "completed" once real UTC time reached 20:00 — a full 8
// real hours after the guest had actually left, gating Elite Booker
// Challenge tier crossings, My Earnings' completed-stay counts, and guest
// feedback eligibility ("Feedback opens once your stay is complete") all
// landing up to 8 hours late.
function d(iso: string) {
  return new Date(iso);
}

describe("isBookingCompleted — real UTC+8 offset, not the placeholder hour", () => {
  const daycation = { stayType: "Daycation", date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-21T00:00:00Z", checkInTime: "08:00", checkOutTime: "20:00", platform: "Direct" };

  it("not completed 30 minutes before the real checkout instant (12:00 UTC = 8pm Manila)", () => {
    expect(isBookingCompleted(daycation, d("2026-08-21T11:30:00Z"))).toBe(false);
  });

  it("completed exactly at the real checkout instant", () => {
    expect(isBookingCompleted(daycation, d("2026-08-21T12:00:00Z"))).toBe(true);
  });

  it("completed 30 minutes after the real checkout instant (was FALSE before this fix)", () => {
    expect(isBookingCompleted(daycation, d("2026-08-21T12:30:00Z"))).toBe(true);
  });

  it("completed almost 8 real hours after checkout, still within the old bug's false window (was FALSE before this fix)", () => {
    expect(isBookingCompleted(daycation, d("2026-08-21T19:59:00Z"))).toBe(true);
  });

  it("an overnight stay completes at its real next-morning instant", () => {
    const overnight = { stayType: "Night", date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-22T00:00:00Z", checkInTime: "20:00", checkOutTime: "08:00", platform: "Direct" };
    expect(isBookingCompleted(overnight, d("2026-08-22T00:00:00Z"))).toBe(true); // 8am Manila Aug22 = 00:00 UTC Aug22
    expect(isBookingCompleted(overnight, d("2026-08-21T23:59:00Z"))).toBe(false);
  });

  it("the no-stayType fallback (bare date/checkOutDate, already real UTC instants) is unaffected by this fix", () => {
    const legacy = { date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-22T00:00:00Z" };
    expect(isBookingCompleted(legacy, d("2026-08-22T00:00:00Z"))).toBe(true);
    expect(isBookingCompleted(legacy, d("2026-08-21T23:59:00Z"))).toBe(false);
  });
});

describe("guestJourneyStage — same real-instant fix, plus the day-bucket must not double-convert", () => {
  const daycation = { stayType: "Daycation", date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-21T00:00:00Z", checkInTime: "08:00", checkOutTime: "20:00", platform: "Direct", cancelledAt: null };

  it("before_stay before the real check-in instant (00:00 UTC = 8am Manila)", () => {
    expect(guestJourneyStage(daycation, d("2026-08-20T23:00:00Z"))).toBe("before_stay");
  });

  it("check_in_day during the stay's own calendar day", () => {
    expect(guestJourneyStage(daycation, d("2026-08-21T06:00:00Z"))).toBe("check_in_day");
  });

  it("completed exactly at the real checkout instant", () => {
    expect(guestJourneyStage(daycation, d("2026-08-21T12:00:00Z"))).toBe("completed");
  });

  it("completed 30 minutes after real checkout — was during_stay/check_in_day before this fix (the guest-portal-facing symptom of the bug)", () => {
    expect(guestJourneyStage(daycation, d("2026-08-21T12:30:00Z"))).toBe("completed");
  });

  it("an overnight stay: still check_in_day late in the evening of the check-in's own Manila calendar day", () => {
    const overnight = { stayType: "Night", date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-22T00:00:00Z", checkInTime: "20:00", checkOutTime: "08:00", platform: "Direct", cancelledAt: null };
    expect(guestJourneyStage(overnight, d("2026-08-21T14:00:00Z"))).toBe("check_in_day"); // 10pm Manila Aug21
  });

  it("an overnight stay: checkout_day once real time crosses into the checkout's own Manila calendar day, even hours before actual checkout", () => {
    const overnight = { stayType: "Night", date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-22T00:00:00Z", checkInTime: "20:00", checkOutTime: "08:00", platform: "Direct", cancelledAt: null };
    expect(guestJourneyStage(overnight, d("2026-08-21T18:00:00Z"))).toBe("checkout_day"); // 2am Manila Aug22, 6h before real checkout
  });

  it("a multi-night stay has a genuine during_stay middle day, distinct from check-in and checkout day", () => {
    const threeNight = { stayType: "Full", date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-24T00:00:00Z", checkInTime: "14:00", checkOutTime: "12:00", platform: "Direct", cancelledAt: null };
    expect(guestJourneyStage(threeNight, d("2026-08-22T04:00:00Z"))).toBe("during_stay"); // noon Manila Aug22
  });

  it("cancelledAt always wins regardless of timing", () => {
    expect(guestJourneyStage({ ...daycation, cancelledAt: "2026-08-20T00:00:00Z" }, d("2026-08-21T06:00:00Z"))).toBe("cancelled");
  });

  it("checkedOutAt always means completed regardless of the real-time comparison", () => {
    expect(guestJourneyStage({ ...daycation, checkedOutAt: "2026-08-21T05:00:00Z" }, d("2026-08-21T06:00:00Z"))).toBe("completed");
  });

  it("the no-stayType fallback is unaffected by this fix", () => {
    const legacy = { date: "2026-08-21T00:00:00Z", checkOutDate: "2026-08-22T00:00:00Z", cancelledAt: null };
    expect(guestJourneyStage(legacy, d("2026-08-21T12:00:00Z"))).toBe("check_in_day");
    expect(guestJourneyStage(legacy, d("2026-08-22T00:00:00Z"))).toBe("completed");
  });
});
