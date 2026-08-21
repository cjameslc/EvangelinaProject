import { describe, expect, it } from "vitest";
import {
  computeIncomeBreakdown,
  computeExpenseBreakdown,
  computeThreeProfitViews,
  computeWaterfall,
  computeBreakEven,
  computeContributionByDimension,
  computeUnitEconomics,
  computeBookerProfitability,
  computeSourceProfitability,
  computeBusinessHealthVerdict,
  computeRedFlags,
  generateBrutalTruths,
  computeStatusQuoProjection,
  computeTopActions,
  type ProfitBooking,
} from "./profitability";
import { type UnitPerformanceRow } from "./units";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function booking(overrides: Partial<ProfitBooking>): ProfitBooking {
  return {
    id: "b1", unitId: "unit-1", bookerId: "emp-1", stayType: "Full", platform: "Direct",
    date: day("2026-08-05"), checkOutDate: day("2026-08-06"), amount: 1000, paid: true, dpAmount: null,
    cancelledAt: null, refundedAt: null, ...overrides,
  };
}

describe("computeIncomeBreakdown", () => {
  it("excludes cancelled bookings from gross, includes real discount given", () => {
    const bookings = [
      booking({ amount: 1000, originalAmount: 1200 }),
      booking({ id: "b2", amount: 500, cancelledAt: day("2026-08-01") }),
    ];
    const income = computeIncomeBreakdown(bookings, { confirmedFutureRevenueCentavos: 0, forecastAdditionalRevenueCentavos: 0 });
    expect(income.grossRevenueCentavos).toBe(100000); // only b1, ₱1000
    expect(income.discountGivenCentavos).toBe(20000); // ₱200 discount
  });

  it("never double counts confirmed/forecast — passes them through from the forecast engine unchanged", () => {
    const income = computeIncomeBreakdown([], { confirmedFutureRevenueCentavos: 50000, forecastAdditionalRevenueCentavos: 30000 });
    expect(income.confirmedFutureIncomeCentavos).toBe(50000);
    expect(income.forecastedAdditionalIncomeCentavos).toBe(30000);
  });
});

describe("computeExpenseBreakdown", () => {
  it("classifies bills by key into Fixed vs Variable correctly", () => {
    const result = computeExpenseBreakdown({
      bills: [
        { key: "amort", paid: true, amountDue: 10000, amountPaid: 10000 },
        { key: "elec", paid: false, amountDue: 3000, amountPaid: null },
        { key: "custom", paid: true, amountDue: 500, amountPaid: 500 },
      ],
      weeklyExpenses: [{ category: "TIKTOK_ADS", amount: 200 }, { category: "GENERAL", amount: 100 }],
      expenseRequests: [{ category: "UNIT_EXPENSE", amount: 150, status: "APPROVED" }, { category: "OTHER", amount: 999, status: "PENDING" }],
      employees: [], salaryHistory: [], bookings: [],
      bookerCommissionPesos: 100,
      periodStart: day("2026-08-01"), periodEnd: day("2026-09-01"), now: day("2026-08-31"),
    });
    expect(result.fixed.amortizationCentavos).toBe(1000000);
    expect(result.fixed.otherFixedCentavos).toBe(50000); // "custom" bucket
    expect(result.variable.electricityCentavos).toBe(300000);
    expect(result.variable.marketingCentavos).toBe(20000);
    expect(result.variable.operationalCentavos).toBe(10000 + 15000); // GENERAL + approved UNIT_EXPENSE only, not the PENDING request
    expect(result.totalPendingCentavos).toBeGreaterThan(0); // unpaid elec bill
  });

  it("charges booker commission only for commission-eligible bookings", () => {
    const bookings = [
      booking({ paid: true }), // eligible
      booking({ id: "b2", paid: false, cancelledAt: null }), // not eligible (unpaid, not cancelled)
      booking({ id: "b3", paid: false, cancelledAt: day("2026-08-01"), cancellationCategory: "guestCancelled", dpAmount: 200 }), // eligible (kept deposit)
    ];
    const result = computeExpenseBreakdown({
      bills: [], weeklyExpenses: [], expenseRequests: [], employees: [], salaryHistory: [], bookings,
      bookerCommissionPesos: 100,
      periodStart: day("2026-08-01"), periodEnd: day("2026-09-01"), now: day("2026-08-31"),
    });
    expect(result.payroll.bookerCommissionsCentavos).toBe(2 * 100 * 100); // 2 eligible x ₱100
  });
});

describe("computeThreeProfitViews", () => {
  it("orders Accounting <= Operating <= Economic is NOT guaranteed — Economic subtracts pending, so it should be <= Operating", () => {
    const income = computeIncomeBreakdown(
      [booking({ amount: 10000, paid: true })],
      { confirmedFutureRevenueCentavos: 0, forecastAdditionalRevenueCentavos: 0 }
    );
    const expense = computeExpenseBreakdown({
      bills: [{ key: "elec", paid: false, amountDue: 1000, amountPaid: null }],
      weeklyExpenses: [], expenseRequests: [], employees: [], salaryHistory: [], bookings: [],
      bookerCommissionPesos: 0,
      periodStart: day("2026-08-01"), periodEnd: day("2026-09-01"), now: day("2026-08-31"),
    });
    const views = computeThreeProfitViews(income, expense);
    expect(views.economicProfitCentavos).toBeLessThanOrEqual(views.operatingProfitCentavos);
    expect(views.operatingProfitCentavos).toBeLessThanOrEqual(views.accountingProfitCentavos);
  });
});

describe("computeWaterfall", () => {
  it("the final step equals gross revenue minus every deducted step, and running total is consistent", () => {
    const income = computeIncomeBreakdown([booking({ amount: 10000, paid: true })], { confirmedFutureRevenueCentavos: 0, forecastAdditionalRevenueCentavos: 0 });
    const expense = computeExpenseBreakdown({
      bills: [{ key: "amort", paid: true, amountDue: 1000, amountPaid: 1000 }],
      weeklyExpenses: [], expenseRequests: [], employees: [], salaryHistory: [], bookings: [],
      bookerCommissionPesos: 0,
      periodStart: day("2026-08-01"), periodEnd: day("2026-09-01"), now: day("2026-08-31"),
    });
    const steps = computeWaterfall(income, expense);
    const netProfitStep = steps[steps.length - 1];
    expect(netProfitStep.label).toBe("Net Profit");
    const manualSum = income.grossRevenueCentavos - steps.slice(1, -1).reduce((s, st) => s - st.deltaCentavos, 0);
    expect(netProfitStep.runningTotalCentavos).toBe(manualSum);
  });
});

describe("computeBreakEven", () => {
  it("computes a real break-even revenue from fixed costs and contribution margin", () => {
    const result = computeBreakEven({
      fixedCostsCentavos: 9000000, // ₱90,000
      totalVariableCostsCentavos: 3500000, // for 10 bookings
      bookingCount: 10,
      grossRevenueCentavos: 10000000, // ₱100,000 gross, avg ₱10,000/booking
      unitCount: 5,
      availableNights: 150,
      currentAdrCentavos: 150000, // ₱1,500 ADR
    });
    // contribution margin = (10000-3500)/10000 = 65%
    expect(result.contributionMarginPct).toBeCloseTo(65, 0);
    expect(result.breakEvenRevenueCentavos).toBeGreaterThan(0);
    expect(result.breakEvenRevenuePerUnitCentavos).toBe(Math.round(result.breakEvenRevenueCentavos / 5));
  });

  it("returns zero break-even revenue (not a crash) when contribution margin is zero or negative", () => {
    const result = computeBreakEven({
      fixedCostsCentavos: 9000000, totalVariableCostsCentavos: 10000000, bookingCount: 10, grossRevenueCentavos: 10000000,
      unitCount: 5, availableNights: 150, currentAdrCentavos: 150000,
    });
    expect(result.breakEvenRevenueCentavos).toBe(0);
  });
});

describe("computeContributionByDimension", () => {
  it("allocates variable cost pro-rata by booking count share", () => {
    const bookings = [
      { unitId: "u1", platform: "Airbnb", stayType: "Full", amount: 1000, paid: true, dpAmount: null, cancelledAt: null, refundedAt: null },
      { unitId: "u2", platform: "Direct", stayType: "Full", amount: 2000, paid: true, dpAmount: null, cancelledAt: null, refundedAt: null },
    ];
    const rows = computeContributionByDimension(bookings as any, "source", 60000, 2); // ₱600 total variable cost / 2 bookings = ₱300 each
    const airbnb = rows.find((r) => r.label === "Airbnb")!;
    expect(airbnb.variableCostCentavos).toBe(30000);
    expect(airbnb.contributionCentavos).toBe(airbnb.grossCentavos - 30000);
  });
});

describe("computeUnitEconomics", () => {
  it("splits shared costs equally across units and computes fully-loaded profit", () => {
    const unitRows: UnitPerformanceRow[] = [
      { unitId: "u1", name: "A", unitNumber: "1", occupancyPct: 50, revenueCentavos: 100000, expensesCentavos: 10000, profitCentavos: 90000, bookingCount: 3, rating: 5, adrCentavos: 100000, revparCentavos: 50000 },
      { unitId: "u2", name: "B", unitNumber: "2", occupancyPct: 50, revenueCentavos: 50000, expensesCentavos: 5000, profitCentavos: 45000, bookingCount: 2, rating: 5, adrCentavos: 100000, revparCentavos: 50000 },
    ];
    const bookings = [
      booking({ unitId: "u1", date: day("2026-08-02"), checkOutDate: day("2026-08-03") }),
      booking({ unitId: "u2", date: day("2026-08-10"), checkOutDate: day("2026-08-11") }),
    ];
    const rows = computeUnitEconomics(unitRows, bookings, 20000, day("2026-08-01"), day("2026-08-31"));
    expect(rows).toHaveLength(2);
    expect(rows[0].allocatedSharedCostsCentavos).toBe(10000); // 20000 / 2 units
    expect(rows[0].fullyLoadedProfitCentavos).toBe(100000 - 10000 - 10000); // revenue - direct - shared
    expect(rows[0].occupiedNights).toBeGreaterThan(0);
  });
});

describe("computeBookerProfitability", () => {
  it("ranks by NET profit (after commission), not gross revenue — flags high volume/low profit", () => {
    const bookers = [{ employeeId: "e1", name: "High Volume" }, { employeeId: "e2", name: "High Value" }];
    const bookings = [
      ...Array.from({ length: 10 }, (_, i) => booking({ id: `hv-${i}`, bookerId: "e1", amount: 500, paid: true })),
      booking({ id: "hval-1", bookerId: "e2", amount: 8000, paid: true }),
    ];
    const rows = computeBookerProfitability(bookers, bookings, 100);
    const highVolume = rows.find((r) => r.employeeId === "e1")!;
    const highValue = rows.find((r) => r.employeeId === "e2")!;
    expect(highVolume.bookings).toBe(10);
    expect(highValue.profitPerBookingCentavos).toBeGreaterThan(highVolume.profitPerBookingCentavos);
  });
});

describe("computeSourceProfitability", () => {
  it("revenue rank and profit rank can diverge", () => {
    const bookings = [
      { unitId: "u1", platform: "Airbnb", stayType: "Full", amount: 5000, paid: true, dpAmount: null, cancelledAt: null, refundedAt: null },
      { unitId: "u1", platform: "Direct", stayType: "Full", amount: 4000, paid: true, dpAmount: null, cancelledAt: null, refundedAt: null },
    ];
    const rows = computeSourceProfitability(bookings as any, 100000, 2); // heavy variable cost allocation
    expect(rows.length).toBe(2);
    expect(rows.every((r) => typeof r.revenueRank === "number" && typeof r.profitRank === "number")).toBe(true);
  });
});

describe("computeBusinessHealthVerdict", () => {
  it("returns LOSING when both operating and economic profit are negative", () => {
    const v = computeBusinessHealthVerdict({
      operatingMarginPct: -10, economicMarginPct: -15, revenueGrowthPct: -5, expenseGrowthPct: 10,
      occupancyPct: 30, breakEvenOccupancyPct: 60, cancellationRatePct: 20, fixedCostToRevenuePct: 50,
    });
    expect(v.band).toBe("losing");
    expect(v.headline).toContain("losing money");
  });

  it("returns WINNING when margins are healthy and revenue outpaces expenses", () => {
    const v = computeBusinessHealthVerdict({
      operatingMarginPct: 30, economicMarginPct: 25, revenueGrowthPct: 10, expenseGrowthPct: 3,
      occupancyPct: 70, breakEvenOccupancyPct: 40, cancellationRatePct: 5, fixedCostToRevenuePct: 20,
    });
    expect(v.band).toBe("winning");
  });

  it("returns AT_RISK when economic profit is negative but operating profit is still positive", () => {
    const v = computeBusinessHealthVerdict({
      operatingMarginPct: 5, economicMarginPct: -3, revenueGrowthPct: 2, expenseGrowthPct: 4,
      occupancyPct: 50, breakEvenOccupancyPct: 45, cancellationRatePct: 8, fixedCostToRevenuePct: 30,
    });
    expect(v.band).toBe("at_risk");
  });
});

describe("computeRedFlags", () => {
  it("fires only the flags whose real threshold is crossed", () => {
    const flags = computeRedFlags({
      revenueGrowthPct: -5, expenseGrowthPct: 10, marginTrendPct: -5, operatingProfitCentavos: -1000, economicProfitCentavos: -2000,
      occupancyPct: 30, breakEvenOccupancyPct: 60, adrCentavos: 800, breakEvenAdrCentavos: 1200,
      topSourceRevenueSharePct: 70, cancellationRatePct: 20, utilityToRevenuePct: 12, payrollToRevenuePct: 40,
      discountToGrossPct: 15, fixedCostToRevenuePct: 45, targetProbabilityPct: 10, projectedRevenueBelowBreakEven: true,
      underperformingUnits: ["Unit 1118"], lowProfitHighVolumeBookers: [], lowContributionHighRevenueSources: [],
    });
    expect(flags.some((f) => f.label === "Revenue declining")).toBe(true);
    expect(flags.some((f) => f.label === "Negative operating profit")).toBe(true);
    expect(flags.some((f) => f.label === "Unit underperformance")).toBe(true);
  });

  it("fires nothing when every input is healthy", () => {
    const flags = computeRedFlags({
      revenueGrowthPct: 10, expenseGrowthPct: 3, marginTrendPct: 2, operatingProfitCentavos: 50000, economicProfitCentavos: 40000,
      occupancyPct: 70, breakEvenOccupancyPct: 40, adrCentavos: 1500, breakEvenAdrCentavos: 1000,
      topSourceRevenueSharePct: 30, cancellationRatePct: 5, utilityToRevenuePct: 5, payrollToRevenuePct: 20,
      discountToGrossPct: 2, fixedCostToRevenuePct: 20, targetProbabilityPct: 80, projectedRevenueBelowBreakEven: false,
      underperformingUnits: [], lowProfitHighVolumeBookers: [], lowContributionHighRevenueSources: [],
    });
    expect(flags).toHaveLength(0);
  });
});

describe("generateBrutalTruths", () => {
  it("never manufactures a statement the numbers don't support", () => {
    const truths = generateBrutalTruths({
      revenueGrowthPct: 10, operatingMarginPct: 30, previousOperatingMarginPct: 30, occupancyPct: 50, breakEvenOccupancyPct: 45,
      adrCentavos: 1500, breakEvenAdrCentavos: 1000, worstUnitLabel: null, worstUnitMarginPct: null, expenseGrowthPct: 3, fixedCostToRevenuePct: 15,
    });
    expect(truths).toHaveLength(0);
  });

  it("flags margin compression when revenue grows but margin declines", () => {
    const truths = generateBrutalTruths({
      revenueGrowthPct: 10, operatingMarginPct: 15, previousOperatingMarginPct: 25, occupancyPct: 50, breakEvenOccupancyPct: 45,
      adrCentavos: 1500, breakEvenAdrCentavos: 1000, worstUnitLabel: null, worstUnitMarginPct: null, expenseGrowthPct: 3, fixedCostToRevenuePct: 15,
    });
    expect(truths.some((t) => t.statement.includes("winning on sales but losing on efficiency"))).toBe(true);
  });
});

describe("computeStatusQuoProjection", () => {
  it("scales linearly by month count", () => {
    const [m1, m3, m6] = computeStatusQuoProjection(1000, 700);
    expect(m3.revenueCentavos).toBe(m1.revenueCentavos * 3);
    expect(m6.revenueCentavos).toBe(m1.revenueCentavos * 6);
    expect(m1.profitCentavos).toBe(m1.revenueCentavos - m1.expensesCentavos);
  });
});

describe("computeTopActions", () => {
  it("ranks actions by estimated monthly impact, highest first, capped at 5", () => {
    const actions = computeTopActions({
      weekendOccupancyPct: 80, weekdayOccupancyPct: 50, weekdayAvailableNightsPerMonth: 60, adrCentavos: 150000,
      occupiedNightsPerMonth: 90, operationalCentavosPerBooking: 20000, bookingsPerMonth: 40, cancellationRatePct: 20,
      cancelledBookingsPerMonth: 10, worstSourceLabel: "TikTok", worstSourceContributionMarginPct: 20, worstSourceRevenueCentavos: 500000,
    });
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i - 1].estimatedMonthlyImpactCentavos).toBeGreaterThanOrEqual(actions[i].estimatedMonthlyImpactCentavos);
    }
  });
});
