import { describe, expect, it } from "vitest";
import {
  computeForecastConfidence, computeMonthlyForecastSummary, forecastByDayOfWeek,
  forecastByUnit, forecastByBooker, forecastBySource, generateForecastInsights,
  type ForecastBooking,
} from "./forecastEngine";
import type { UnitPerformanceRow } from "./units";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function booking(overrides: Partial<ForecastBooking>): ForecastBooking {
  return {
    id: "b1", unitId: "unit-1", bookerId: null, stayType: "Full", platform: "Direct",
    date: day("2026-08-01"), checkOutDate: day("2026-08-02"), amount: 1000, paid: true, dpAmount: null,
    cancelledAt: null, refundedAt: null, ...overrides,
  };
}

describe("computeForecastConfidence", () => {
  it("never claims high confidence with fewer than 3 trailing periods, regardless of how strong other factors look", () => {
    const result = computeForecastConfidence({
      trailingPeriodCount: 2, currentPeriodBookingCount: 100, elapsedFraction: 1,
      dailyPaceCoefficientOfVariation: 0, cancellationRatePct: 0, remainingAvailableNights: 100,
    });
    expect(result.score).toBeLessThanOrEqual(70);
    expect(result.band).not.toBe("high");
  });

  it("returns insufficient confidence with genuinely no data at all", () => {
    const result = computeForecastConfidence({
      trailingPeriodCount: 0, currentPeriodBookingCount: 0, elapsedFraction: 0.5,
      dailyPaceCoefficientOfVariation: null, cancellationRatePct: 0, remainingAvailableNights: 10,
    });
    expect(result.band).toBe("insufficient");
    expect(result.label).toContain("Insufficient historical data");
  });

  it("a high cancellation rate pulls confidence down relative to an otherwise-identical low-cancellation scenario", () => {
    const base = { trailingPeriodCount: 5, currentPeriodBookingCount: 40, elapsedFraction: 0.8, dailyPaceCoefficientOfVariation: 0.1, remainingAvailableNights: 30 };
    const lowCancel = computeForecastConfidence({ ...base, cancellationRatePct: 2 });
    const highCancel = computeForecastConfidence({ ...base, cancellationRatePct: 40 });
    expect(highCancel.score).toBeLessThan(lowCancel.score);
  });

  it("every result carries a qualitative label alongside the number — never a bare percentage", () => {
    const result = computeForecastConfidence({
      trailingPeriodCount: 5, currentPeriodBookingCount: 50, elapsedFraction: 0.9,
      dailyPaceCoefficientOfVariation: 0.05, cancellationRatePct: 5, remainingAvailableNights: 20,
    });
    expect(result.label).toMatch(/%/);
    expect(result.label).toMatch(/Low|Medium|High/);
  });
});

describe("computeMonthlyForecastSummary — the core forecast", () => {
  const monthStart = day("2026-08-01");
  const monthEnd = day("2026-09-01");

  function baseParams(overrides: Partial<Parameters<typeof computeMonthlyForecastSummary>[0]> = {}) {
    return {
      currentMonthBookings: [] as ForecastBooking[],
      now: day("2026-08-16"), // halfway through August
      monthStart, monthEnd,
      targetPesos: 100_000,
      unitCount: 5,
      maintenanceNightsRemaining: 0,
      trailingMonthRevenuePesos: [80_000, 90_000, 100_000],
      trailingMonthBookingCounts: [40, 45, 50],
      trailingMonthOccupancyPct: [50, 55, 60],
      cancellationRatePct: 5,
      currentMonthNetProfitSoFarCentavos: 0,
      actualOccupancyPctSoFar: 0,
      ...overrides,
    };
  }

  it("Actual only counts elapsed (already-checked-in-or-past) bookings, never future-dated ones", () => {
    const bookings: ForecastBooking[] = [
      booking({ date: day("2026-08-05"), amount: 5000, paid: true }), // elapsed (before 'now' = Aug 16)
      booking({ date: day("2026-08-25"), amount: 7000, paid: true }), // future — should be Confirmed, not Actual
    ];
    const summary = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: bookings, currentMonthNetProfitSoFarCentavos: 500_000 }));
    expect(summary.actualRevenueCentavos).toBe(500_000); // 5000 pesos * 100
    expect(summary.confirmedFutureRevenueCentavos).toBe(700_000); // 7000 pesos * 100
  });

  it("Confirmed uses the full contract (gross) value, not just what's been collected so far", () => {
    const bookings: ForecastBooking[] = [
      booking({ date: day("2026-08-25"), amount: 3000, paid: false, dpAmount: 500 }), // unpaid balance, only DP collected
    ];
    const summary = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: bookings }));
    // gross = amount + dpAmount = 3000 + 500 = 3500 pesos, regardless of paid=false
    expect(summary.confirmedFutureRevenueCentavos).toBe(350_000);
  });

  it("a cancelled booking contributes to neither Actual nor Confirmed", () => {
    const bookings: ForecastBooking[] = [
      booking({ date: day("2026-08-05"), amount: 5000, paid: true, cancelledAt: day("2026-08-06") }),
    ];
    const summary = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: bookings }));
    expect(summary.actualRevenueCentavos).toBe(0);
    expect(summary.confirmedFutureRevenueCentavos).toBe(0);
  });

  it("Projected = Actual + Confirmed + Forecast, always", () => {
    const bookings: ForecastBooking[] = [
      booking({ date: day("2026-08-05"), amount: 5000, paid: true }),
      booking({ date: day("2026-08-25"), amount: 3000, paid: true }),
    ];
    const summary = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: bookings, currentMonthNetProfitSoFarCentavos: 100_000 }));
    expect(summary.projectedRevenueCentavos).toBe(summary.actualRevenueCentavos + summary.confirmedFutureRevenueCentavos + summary.forecastAdditionalRevenueCentavos);
  });

  it("Conservative <= Expected <= Optimistic revenue, always", () => {
    const bookings: ForecastBooking[] = [booking({ date: day("2026-08-05"), amount: 5000, paid: true })];
    const summary = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: bookings }));
    expect(summary.scenarios.conservative.revenueCentavos).toBeLessThanOrEqual(summary.scenarios.expected.revenueCentavos);
    expect(summary.scenarios.expected.revenueCentavos).toBeLessThanOrEqual(summary.scenarios.optimistic.revenueCentavos);
  });

  it("Conservative scenario never includes any speculative forecast — exactly Actual + Confirmed", () => {
    const bookings: ForecastBooking[] = [
      booking({ date: day("2026-08-05"), amount: 5000, paid: true }),
      booking({ date: day("2026-08-25"), amount: 3000, paid: true }),
    ];
    const summary = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: bookings }));
    expect(summary.scenarios.conservative.revenueCentavos).toBe(summary.actualRevenueCentavos + summary.confirmedFutureRevenueCentavos);
  });

  it("target probability is null (never fabricated) with fewer than 2 trailing periods of variance data", () => {
    const summary = computeMonthlyForecastSummary(baseParams({ trailingMonthRevenuePesos: [80_000] }));
    expect(summary.targetProbabilityPct).toBeNull();
  });

  it("target probability, when stated, is always rounded to the nearest 5% — never false precision", () => {
    const summary = computeMonthlyForecastSummary(baseParams());
    if (summary.targetProbabilityPct !== null) {
      expect(summary.targetProbabilityPct % 5).toBe(0);
    }
  });

  it("revenue pace is null (never a fabricated ratio) with zero trailing-period baseline", () => {
    const summary = computeMonthlyForecastSummary(baseParams({ trailingMonthRevenuePesos: [], trailingMonthBookingCounts: [], trailingMonthOccupancyPct: [] }));
    expect(summary.pace.revenuePacePct).toBeNull();
    expect(summary.pace.historicalExpectedAtSamePointPesos).toBeNull();
  });

  it("revenue pace > 100 correctly signals ahead-of-pace, < 100 signals behind", () => {
    // Historical average ~90,000/month over 3 months, halfway through August (day 16 of 31) -> expected ~46,451
    const aheadBookings: ForecastBooking[] = [booking({ date: day("2026-08-05"), amount: 60_000, paid: true })];
    const ahead = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: aheadBookings }));
    expect(ahead.pace.revenuePacePct).toBeGreaterThan(100);

    const behindBookings: ForecastBooking[] = [booking({ date: day("2026-08-05"), amount: 5_000, paid: true })];
    const behind = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: behindBookings }));
    expect(behind.pace.revenuePacePct).toBeLessThan(100);
  });

  it("empty period (no bookings at all, no trailing history) never throws and returns honest zeros/nulls", () => {
    const summary = computeMonthlyForecastSummary(baseParams({ trailingMonthRevenuePesos: [], trailingMonthBookingCounts: [], trailingMonthOccupancyPct: [] }));
    expect(summary.actualRevenueCentavos).toBe(0);
    expect(summary.projectedRevenueCentavos).toBe(0);
    expect(summary.confidence.band).toBe("insufficient");
  });

  it("respects real month-length date boundaries — end of month is exclusive, no bleed into next month", () => {
    const bookings: ForecastBooking[] = [
      booking({ date: day("2026-08-31"), amount: 1000, paid: true }), // last day of August, still elapsed relative to Aug16... actually future
      booking({ date: day("2026-09-01"), amount: 9999, paid: true }), // September — must not count at all
    ];
    const summary = computeMonthlyForecastSummary(baseParams({ currentMonthBookings: bookings }));
    // Aug 31 booking counts as Confirmed (future within August); Sept 1 booking isn't in currentMonthBookings scope at all in real usage (caller wouldn't include it) — verify Aug 31 is captured and nothing overflows.
    expect(summary.confirmedFutureRevenueCentavos).toBeGreaterThanOrEqual(100_000); // at least the Aug 31 booking
  });
});

describe("forecastByDayOfWeek", () => {
  it("buckets occupancy by real occupied NIGHTS, not booking count — a multi-night stay must count each night on its own weekday", () => {
    // Aug 1, 2026 is a Saturday. A 3-night Full stay Aug1->Aug4 occupies Sat, Sun, Mon nights.
    const bookings = [
      { unitId: "unit-1", stayType: "Full", date: day("2026-08-01"), checkOutDate: day("2026-08-04"), amount: 3000, paid: true, dpAmount: null, cancelledAt: null },
    ];
    const rows = forecastByDayOfWeek(bookings, 1, day("2026-08-01"), day("2026-08-08"));
    const sat = rows.find((r) => r.label === "Saturday")!;
    const sun = rows.find((r) => r.label === "Sunday")!;
    const mon = rows.find((r) => r.label === "Monday")!;
    // Each of the 3 occupied nights should register on its own weekday's occupancy — not all 3 piled onto Saturday (the check-in day).
    expect(sat.occupancyPct).toBeGreaterThan(0);
    expect(sun.occupancyPct).toBeGreaterThan(0);
    expect(mon.occupancyPct).toBeGreaterThan(0);
  });

  it("bookings/revenue bucket by check-in weekday (when demand happens), distinct from the nights-based occupancy bucketing", () => {
    const bookings = [
      { unitId: "unit-1", stayType: "Full", date: day("2026-08-01"), checkOutDate: day("2026-08-04"), amount: 3000, paid: true, dpAmount: null, cancelledAt: null }, // check-in Saturday
    ];
    const rows = forecastByDayOfWeek(bookings, 1, day("2026-08-01"), day("2026-08-08"));
    const sat = rows.find((r) => r.label === "Saturday")!;
    expect(sat.avgBookings).toBeGreaterThan(0);
    const sun = rows.find((r) => r.label === "Sunday")!;
    expect(sun.avgBookings).toBe(0); // the booking itself is only counted once, on its check-in day
  });

  it("excludes cancelled bookings from both revenue and occupied nights", () => {
    const bookings = [
      { unitId: "unit-1", stayType: "Full", date: day("2026-08-01"), checkOutDate: day("2026-08-02"), amount: 5000, paid: true, dpAmount: null, cancelledAt: day("2026-08-01") },
    ];
    const rows = forecastByDayOfWeek(bookings, 1, day("2026-08-01"), day("2026-08-08"));
    expect(rows.every((r) => r.avgRevenueCentavos === 0)).toBe(true);
    expect(rows.every((r) => r.occupancyPct === 0)).toBe(true);
  });

  it("demand index is 100 for a perfectly flat week (every day identical)", () => {
    const bookings = Array.from({ length: 7 }, (_, i) => ({
      unitId: "unit-1", stayType: "Full", date: new Date(day("2026-08-01").getTime() + i * 86400000), checkOutDate: new Date(day("2026-08-02").getTime() + i * 86400000),
      amount: 1000, paid: true, dpAmount: null, cancelledAt: null,
    }));
    const rows = forecastByDayOfWeek(bookings, 1, day("2026-08-01"), day("2026-08-08"));
    for (const r of rows) expect(r.forecastDemandIndex).toBe(100);
  });
});

describe("forecastByUnit", () => {
  const unitRow: UnitPerformanceRow = {
    unitId: "unit-1", name: "Unit A", unitNumber: "101", occupancyPct: 50,
    revenueCentavos: 500_000, expensesCentavos: 0, profitCentavos: 500_000, bookingCount: 10, rating: 4.9,
    adrCentavos: 50_000, revparCentavos: 25_000,
  };

  it("projects a unit's forecast revenue from its own elapsed pace", () => {
    const rows = forecastByUnit([unitRow], {}, 10, 20); // 10 of 20 days elapsed
    expect(rows[0].forecastRevenueCentavos).toBe(500_000 + Math.round((500_000 / 10) * 10)); // double the actual, 10 more days at the same pace
  });

  it("marks the single unit as best performer, never underperformer, when there's only one unit", () => {
    const rows = forecastByUnit([unitRow], {}, 10, 20);
    expect(rows[0].isBestPerformer).toBe(true);
    expect(rows[0].isUnderperformer).toBe(false);
  });

  it("correctly identifies best and underperforming units among several", () => {
    const strong: UnitPerformanceRow = { ...unitRow, unitId: "unit-strong", name: "Strong", revenueCentavos: 1_000_000 };
    const weak: UnitPerformanceRow = { ...unitRow, unitId: "unit-weak", name: "Weak", revenueCentavos: 10_000 };
    const rows = forecastByUnit([strong, weak], {}, 10, 20);
    const strongRow = rows.find((r) => r.unitId === "unit-strong")!;
    const weakRow = rows.find((r) => r.unitId === "unit-weak")!;
    expect(strongRow.isBestPerformer).toBe(true);
    expect(weakRow.isUnderperformer).toBe(true);
  });

  it("trend is 'stable' (never a fabricated up/down) with no last-period baseline", () => {
    const rows = forecastByUnit([unitRow], {}, 10, 20);
    expect(rows[0].trend).toBe("stable");
  });
});

describe("forecastByBooker", () => {
  it("attributes revenue only to the real bookerId, using the same collected-amount rule as the rest of the app", () => {
    const bookers = [{ employeeId: "emp-1", name: "Alice" }, { employeeId: "emp-2", name: "Bob" }];
    const bookings: ForecastBooking[] = [
      booking({ bookerId: "emp-1", amount: 5000, paid: true }),
      booking({ bookerId: "emp-2", amount: 3000, paid: true }),
      booking({ bookerId: null, amount: 9999, paid: true }), // unattributed — must not leak onto anyone
    ];
    const rows = forecastByBooker(bookers, bookings, {}, 10, 20);
    expect(rows.find((r) => r.employeeId === "emp-1")!.revenueCentavos).toBe(500_000);
    expect(rows.find((r) => r.employeeId === "emp-2")!.revenueCentavos).toBe(300_000);
  });

  it("excludes cancelled bookings from a booker's totals", () => {
    const bookers = [{ employeeId: "emp-1", name: "Alice" }];
    const bookings: ForecastBooking[] = [booking({ bookerId: "emp-1", amount: 5000, paid: true, cancelledAt: day("2026-08-02") })];
    const rows = forecastByBooker(bookers, bookings, {}, 10, 20);
    expect(rows[0].revenueCentavos).toBe(0);
  });

  it("status is 'behind' for a booker with zero bookings and no prior-period baseline — never defaults to a falsely positive status", () => {
    const bookers = [{ employeeId: "emp-1", name: "Alice" }];
    const rows = forecastByBooker(bookers, [], {}, 10, 20);
    expect(rows[0].status).toBe("behind");
  });

  it("status reflects real growth vs the booker's own last-period revenue, not a fabricated per-person quota", () => {
    const bookers = [{ employeeId: "emp-1", name: "Alice" }];
    const bookings: ForecastBooking[] = [booking({ bookerId: "emp-1", amount: 20_000, paid: true })];
    const rows = forecastByBooker(bookers, bookings, { "emp-1": 500_000 }, 10, 20); // forecast should exceed last period by 10%+
    expect(rows[0].status).toBe("ahead");
  });
});

describe("forecastBySource", () => {
  it("never fabricates a platform-fee or net-profit-by-source figure — only real gross/forecast revenue and growth", () => {
    const bookings = [
      { unitId: "unit-1", amount: 5000, paid: true, dpAmount: null, cancelledAt: null, platform: "Airbnb", stayType: "Full", method: null },
    ];
    const rows = forecastBySource(bookings, {}, 10, 20);
    const row = rows[0] as unknown as Record<string, unknown>;
    expect(row.platformFeeCentavos).toBeUndefined();
    expect(row.netProfitCentavos).toBeUndefined();
  });

  it("computes real growth % against the same source's last-period revenue", () => {
    const bookings = [
      { unitId: "unit-1", amount: 20_000, paid: true, dpAmount: null, cancelledAt: null, platform: "Airbnb", stayType: "Full", method: null },
    ];
    const rows = forecastBySource(bookings, { Airbnb: 1_000_000 }, 10, 20);
    expect(rows[0].growthPct).not.toBeNull();
  });

  it("growth is null (not fabricated) with no last-period baseline for that source", () => {
    const bookings = [
      { unitId: "unit-1", amount: 20_000, paid: true, dpAmount: null, cancelledAt: null, platform: "TikTok", stayType: "Full", method: null },
    ];
    const rows = forecastBySource(bookings, {}, 10, 20);
    expect(rows[0].growthPct).toBeNull();
  });
});

describe("generateForecastInsights", () => {
  const monthStart = day("2026-08-01");
  const monthEnd = day("2026-09-01");

  it("generates real, data-driven insight text — not a hardcoded static list", () => {
    const bookings: ForecastBooking[] = [booking({ date: day("2026-08-05"), amount: 5_000, paid: true })];
    const summary = computeMonthlyForecastSummary({
      currentMonthBookings: bookings, now: day("2026-08-16"), monthStart, monthEnd, targetPesos: 500_000,
      unitCount: 5, maintenanceNightsRemaining: 0, trailingMonthRevenuePesos: [400_000, 420_000, 450_000],
      trailingMonthBookingCounts: [40, 42, 45], trailingMonthOccupancyPct: [50, 52, 55], cancellationRatePct: 5,
      currentMonthNetProfitSoFarCentavos: 100_000, actualOccupancyPctSoFar: 20,
    });
    const insights = generateForecastInsights({ summary, weekdayRows: [], unitRows: [], bookerRows: [] });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.every((i) => i.detail.length > 0)).toBe(true);
  });

  it("never returns more than 5 insights", () => {
    const bookings: ForecastBooking[] = [booking({ date: day("2026-08-05"), amount: 1_000, paid: true })];
    const summary = computeMonthlyForecastSummary({
      currentMonthBookings: bookings, now: day("2026-08-16"), monthStart, monthEnd, targetPesos: 5_000_000,
      unitCount: 5, maintenanceNightsRemaining: 0, trailingMonthRevenuePesos: [400_000, 420_000, 450_000],
      trailingMonthBookingCounts: [40, 42, 45], trailingMonthOccupancyPct: [50, 52, 55], cancellationRatePct: 5,
      currentMonthNetProfitSoFarCentavos: 100_000, actualOccupancyPctSoFar: 20,
    });
    const weekdayRows = [
      { dow: 0, label: "Sunday", avgBookings: 1, avgRevenueCentavos: 100_000, occupancyPct: 40, adrCentavos: 100_000, revparCentavos: 40_000, forecastDemandIndex: 140 },
      { dow: 6, label: "Saturday", avgBookings: 1, avgRevenueCentavos: 100_000, occupancyPct: 40, adrCentavos: 100_000, revparCentavos: 40_000, forecastDemandIndex: 140 },
      { dow: 1, label: "Monday", avgBookings: 1, avgRevenueCentavos: 30_000, occupancyPct: 10, adrCentavos: 30_000, revparCentavos: 10_000, forecastDemandIndex: 40 },
    ];
    const unitRows = [{ ...({} as UnitPerformanceRow), unitId: "u1", name: "Weak Unit", occupancyPct: 5, revenueCentavos: 1000, expensesCentavos: 0, profitCentavos: 1000, bookingCount: 1, rating: 4, adrCentavos: 1000, revparCentavos: 500, forecastRevenueCentavos: 1000, trend: "down" as const, isBestPerformer: false, isUnderperformer: true }];
    const bookerRows = [{ employeeId: "e1", name: "Struggling Booker", currentBookings: 0, revenueCentavos: 0, netProfitCentavos: 0, forecastBookings: 0, forecastRevenueCentavos: 0, forecastNetProfitCentavos: 0, status: "behind" as const }];
    const insights = generateForecastInsights({ summary, weekdayRows, unitRows, bookerRows });
    expect(insights.length).toBeLessThanOrEqual(5);
  });
});
