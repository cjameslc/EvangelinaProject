// Income vs. Expenses / profitability intelligence — the one centralized
// engine every "am I actually making money" figure on the Metrics tab is
// computed through (same "one calculation, one source of truth" discipline
// forecastEngine.ts documents). Every function here is a pure composition
// of this app's existing, already-verified primitives (finance.ts,
// payroll.ts, revenue.ts, occupancy.ts, units.ts, bookingStatus.ts,
// stayRange.ts) — never a second, competing formula for something that
// already has a real one.
//
// Data-integrity decisions made explicit here, confirmed with the business
// owner before this was built (never silently guessed):
//   - Parking revenue, extension revenue, management fees, replacement
//     costs, and true unit ROI are OMITTED entirely — this app has zero
//     real collected-amount data for any of them (parking/extension are
//     only *rate* settings, never a logged payment; extension charges get
//     irreversibly folded into Booking.amount at entry with no way to
//     recover the split later; management fees and unit purchase price/
//     capex don't exist as a concept anywhere in the schema). Showing a
//     ₱0 or guessed figure for these would be fabrication, not analysis.
//   - Booking Source Profitability is GROSS-ONLY for every source. Real
//     platform-fee data exists only as a monthly, portfolio-wide Airbnb
//     PDF-import total (AirbnbEarningsMonth, unlinked to individual
//     bookings) — no fee data exists for TikTok/Facebook/WalkIn/Direct at
//     all. Deducting Airbnb's real fee while leaving every other source
//     gross would make Airbnb look artificially less profitable than
//     sources with simply-unmeasured fees, not actually-lower fees.
//   - "Cleaning"/"Laundry"/"Supplies" have no distinct expense category in
//     this app (only WeeklyExpense.GENERAL and ExpenseRequest.UNIT_EXPENSE/
//     PASA_GUEST/OTHER exist as untyped operational-cost catch-alls) — they
//     are shown as one honestly-labeled "Operational (supplies, cleaning,
//     guest-related, misc.)" bucket, never split into named categories that
//     don't exist as real data.
//   - Booker commission (Settings.bookerCommission × isCommissionEligible
//     bookings) IS real, attributable, per-booking data — unlike
//     forecastEngine.ts's/campaignEngine's own "no cost is attributable to
//     an individual booker" reasoning (which is a deliberate methodology
//     choice in those two modules, not a data gap), this module nets real
//     commission cost out of booker profitability, because the brief
//     explicitly requires NET profit per booker, and the data exists.

import { grossAmountCentavos, collectedAmountCentavos, netProfitCentavos, marginPct } from "@/lib/finance";
import { collectedRevenueCentavos, revenueByDimension, type DimensionBooking } from "@/lib/analytics/revenue";
import { isCommissionEligible } from "@/lib/bookingStatus";
import { occupiedRange } from "@/lib/stayRange";
import { totalSalaryPayroll, type SalaryHistoryEntry } from "@/lib/payroll";
import { type UnitPerformanceRow } from "@/lib/analytics/units";
import { type MonthlyForecastSummary } from "@/lib/analytics/forecastEngine";

export type ProfitBooking = {
  id: string;
  unitId: string;
  bookerId: string | null;
  stayType: string;
  platform: string;
  date: string | Date;
  checkOutDate: string | Date | null;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
  cancellationCategory?: string | null;
  refundedAt?: string | Date | null;
  originalAmount?: number | null;
  couponDiscountAmount?: number | null;
};

// ---------------------------------------------------------------------
// Income breakdown — brief section 2.
// ---------------------------------------------------------------------

export type IncomeBreakdown = {
  grossRevenueCentavos: number; // full contract value of every non-cancelled booking
  collectedRevenueCentavos: number; // money actually in hand ("net booking revenue")
  discountGivenCentavos: number; // originalAmount - amount, real per-booking discount data — informational, never double-subtracted (amount is already net of it)
  totalRealizedIncomeCentavos: number; // = collectedRevenueCentavos, named per the brief's own vocabulary
  confirmedFutureIncomeCentavos: number; // from the Forecast engine's own Confirmed figure — never recomputed independently
  forecastedAdditionalIncomeCentavos: number; // from the Forecast engine's own Forecast figure
};

export function computeIncomeBreakdown(
  bookings: ProfitBooking[],
  forecast: Pick<MonthlyForecastSummary, "confirmedFutureRevenueCentavos" | "forecastAdditionalRevenueCentavos">
): IncomeBreakdown {
  const active = bookings.filter((b) => !b.cancelledAt);
  const grossRevenueCentavos = active.reduce((s, b) => s + grossAmountCentavos(b), 0);
  const collected = collectedRevenueCentavos(bookings);
  const discountGivenCentavos = active.reduce((s, b) => {
    if (b.originalAmount == null || b.originalAmount <= b.amount) return s;
    return s + (b.originalAmount - b.amount) * 100;
  }, 0);
  return {
    grossRevenueCentavos,
    collectedRevenueCentavos: collected,
    discountGivenCentavos,
    totalRealizedIncomeCentavos: collected,
    confirmedFutureIncomeCentavos: forecast.confirmedFutureRevenueCentavos,
    forecastedAdditionalIncomeCentavos: forecast.forecastAdditionalRevenueCentavos,
  };
}

// ---------------------------------------------------------------------
// Expense breakdown — brief section 2. Bill.key IS the real category
// identifier for template-generated bills (see CATEGORY_TO_BILL_KEY in
// recurringExpenses.ts: amort/elec/water/net/assoc/stream) — classifying
// by key avoids a second join to RecurringExpenseTemplate for the same
// information. Anything else (custom/legacy bills, key="custom" or
// missing) falls into "Other" rather than being guessed into a named
// bucket.
// ---------------------------------------------------------------------

const FIXED_BILL_KEYS = new Set(["amort", "net", "assoc", "stream"]);
const VARIABLE_BILL_KEYS = new Set(["elec", "water"]);

export type BillLike = { key: string; paid: boolean; amountDue: number; amountPaid: number | null; amountDueCentavos?: number | null; amountPaidCentavos?: number | null };

function billAmountCentavos(b: BillLike): number {
  return b.amountDueCentavos != null ? b.amountDueCentavos : b.amountDue * 100;
}
function billPaidAmountCentavos(b: BillLike): number {
  if (!b.paid) return 0;
  return b.amountPaidCentavos != null ? b.amountPaidCentavos : (b.amountPaid ?? b.amountDue) * 100;
}

export type FixedExpenses = {
  amortizationCentavos: number;
  internetCentavos: number;
  associationDuesCentavos: number;
  subscriptionsCentavos: number;
  otherFixedCentavos: number;
  paidCentavos: number;
  pendingCentavos: number;
  totalCentavos: number;
};

export type VariableExpenses = {
  electricityCentavos: number;
  waterCentavos: number;
  marketingCentavos: number; // TikTok ads (WeeklyExpense + ExpenseRequest, both real ad-spend categories)
  operationalCentavos: number; // WeeklyExpense.GENERAL + approved ExpenseRequest.UNIT_EXPENSE/PASA_GUEST/OTHER — honestly labeled catch-all, not a fabricated Cleaning/Laundry/Supplies split
  paidCentavos: number; // bill-based portion only (electricity/water)
  pendingCentavos: number;
  totalCentavos: number;
};

export type PayrollExpenses = {
  salaryCentavos: number; // accrued, elapsed-portion-only — same rule accruedOperationalCostsCentavos already uses
  bookerCommissionsCentavos: number; // real: Settings.bookerCommission x commission-eligible bookings
  totalCentavos: number;
};

export type ExpenseBreakdown = {
  fixed: FixedExpenses;
  variable: VariableExpenses;
  payroll: PayrollExpenses;
  totalPaidCentavos: number; // cash actually out the door (paid bills only)
  totalAccruedCentavos: number; // paid + payroll + commission — everything genuinely owed for the elapsed period
  totalPendingCentavos: number; // unpaid bills — informational, never subtracted from a profit figure
};

export function computeExpenseBreakdown(params: {
  bills: BillLike[];
  weeklyExpenses: { category: string; amount: number; targetEmployeeId?: string | null }[];
  expenseRequests: { category: string; amount: number; status: string }[];
  employees: { id: string; role: string; monthlySalary: number; active?: boolean }[];
  salaryHistory: SalaryHistoryEntry[];
  bookings: ProfitBooking[];
  bookerCommissionPesos: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): ExpenseBreakdown {
  const { bills, weeklyExpenses, expenseRequests, employees, salaryHistory, bookings, bookerCommissionPesos, periodStart, periodEnd, now } = params;

  const bucket = (keys: Set<string>) => bills.filter((b) => keys.has(b.key));
  const sumTotal = (rows: BillLike[]) => rows.reduce((s, b) => s + billAmountCentavos(b), 0);
  const sumPaid = (rows: BillLike[]) => rows.reduce((s, b) => s + billPaidAmountCentavos(b), 0);

  const amortRows = bills.filter((b) => b.key === "amort");
  const netRows = bills.filter((b) => b.key === "net");
  const assocRows = bills.filter((b) => b.key === "assoc");
  const streamRows = bills.filter((b) => b.key === "stream");
  const otherFixedRows = bills.filter((b) => !FIXED_BILL_KEYS.has(b.key) && !VARIABLE_BILL_KEYS.has(b.key));
  const fixedRows = [...amortRows, ...netRows, ...assocRows, ...streamRows, ...otherFixedRows];

  const elecRows = bills.filter((b) => b.key === "elec");
  const waterRows = bills.filter((b) => b.key === "water");
  const variableBillRows = [...elecRows, ...waterRows];

  const fixed: FixedExpenses = {
    amortizationCentavos: sumTotal(amortRows),
    internetCentavos: sumTotal(netRows),
    associationDuesCentavos: sumTotal(assocRows),
    subscriptionsCentavos: sumTotal(streamRows),
    otherFixedCentavos: sumTotal(otherFixedRows),
    paidCentavos: sumPaid(fixedRows),
    pendingCentavos: sumTotal(fixedRows) - sumPaid(fixedRows),
    totalCentavos: sumTotal(fixedRows),
  };

  const marketingCentavos =
    weeklyExpenses.filter((e) => e.category === "TIKTOK_ADS").reduce((s, e) => s + e.amount, 0) * 100 +
    expenseRequests.filter((e) => e.category === "TIKTOK_ADS" && e.status === "APPROVED").reduce((s, e) => s + e.amount, 0) * 100;
  // A GENERAL entry WITH a targetEmployeeId is a payroll adjustment against
  // that specific person (see WeeklyExpense's own schema comment), not
  // general operational spend — excluded here so it isn't counted twice
  // against both this bucket and the flat-salary payroll figure below.
  const operationalCentavos =
    weeklyExpenses.filter((e) => e.category === "GENERAL" && !e.targetEmployeeId).reduce((s, e) => s + e.amount, 0) * 100 +
    expenseRequests.filter((e) => e.category !== "TIKTOK_ADS" && e.status === "APPROVED").reduce((s, e) => s + e.amount, 0) * 100;

  const variable: VariableExpenses = {
    electricityCentavos: sumTotal(elecRows),
    waterCentavos: sumTotal(waterRows),
    marketingCentavos,
    operationalCentavos,
    paidCentavos: sumPaid(variableBillRows),
    pendingCentavos: sumTotal(variableBillRows) - sumPaid(variableBillRows),
    totalCentavos: sumTotal(variableBillRows) + marketingCentavos + operationalCentavos,
  };

  // Same accrual rule accruedOperationalCostsCentavos already uses:
  // salary owed only for the portion of the period that's elapsed.
  const effectiveEnd = periodEnd.getTime() < now.getTime() ? periodEnd : now;
  const accruedDays = Math.max(0, Math.round((effectiveEnd.getTime() - periodStart.getTime()) / 86400000));
  const salaryCentavos = totalSalaryPayroll(employees, salaryHistory, "custom", periodStart, accruedDays) * 100;
  const bookerCommissionsCentavos = bookings.filter((b) => isCommissionEligible(b)).length * bookerCommissionPesos * 100;

  const payroll: PayrollExpenses = { salaryCentavos, bookerCommissionsCentavos, totalCentavos: salaryCentavos + bookerCommissionsCentavos };

  return {
    fixed,
    variable,
    payroll,
    totalPaidCentavos: fixed.paidCentavos + variable.paidCentavos,
    totalAccruedCentavos: fixed.paidCentavos + variable.totalCentavos + payroll.totalCentavos,
    totalPendingCentavos: fixed.pendingCentavos + variable.pendingCentavos,
  };
}

// ---------------------------------------------------------------------
// Three profit views — brief section 3. Each is a strictly wider circle
// of real, already-incurred obligations — never a fabricated one.
//   Accounting: cash-basis only (paid bills), matching finance.ts's own
//     documented "an expense only affects Net Profit once it's actually
//     been paid" rule exactly — the strictest, most conservative view.
//   Operating: + accrued payroll and booker commission — money genuinely
//     owed for work already done this period, whether or not cash has
//     physically left yet (same rule Dashboard's "Realized Profit" and
//     accruedOperationalCostsCentavos already use elsewhere).
//   Economic: + pending bills whose billing month falls within this
//     period — a real obligation already incurred (the bill exists, for
//     this exact period, marked unpaid) even though cash hasn't moved.
//     Does NOT include depreciation/replacement-cost or a debt-principal
//     schedule — no such data exists (see module doc comment) — so this
//     is the most conservative "true economic cost" figure obtainable
//     without inventing an asset-value model.
// ---------------------------------------------------------------------

export type ThreeProfitViews = {
  accountingProfitCentavos: number;
  accountingMarginPct: number;
  operatingProfitCentavos: number;
  operatingMarginPct: number;
  economicProfitCentavos: number;
  economicMarginPct: number;
};

export function computeThreeProfitViews(income: IncomeBreakdown, expense: ExpenseBreakdown): ThreeProfitViews {
  const revenue = income.collectedRevenueCentavos;
  const accountingProfitCentavos = netProfitCentavos({ revenueCentavos: revenue, paidExpensesCentavos: expense.totalPaidCentavos });
  const operatingProfitCentavos = netProfitCentavos({ revenueCentavos: revenue, paidExpensesCentavos: expense.totalPaidCentavos, otherPaidCostsCentavos: expense.variable.totalCentavos - expense.variable.paidCentavos + expense.payroll.totalCentavos });
  const economicProfitCentavos = operatingProfitCentavos - expense.totalPendingCentavos;
  return {
    accountingProfitCentavos,
    accountingMarginPct: marginPct(accountingProfitCentavos, revenue),
    operatingProfitCentavos,
    operatingMarginPct: marginPct(operatingProfitCentavos, revenue),
    economicProfitCentavos,
    economicMarginPct: marginPct(economicProfitCentavos, revenue),
  };
}

// ---------------------------------------------------------------------
// Profitability waterfall — brief section 4. Platform Fees step is
// deliberately absent (gross-only decision, see module doc comment).
// ---------------------------------------------------------------------

export type WaterfallStep = { label: string; deltaCentavos: number; runningTotalCentavos: number };

export function computeWaterfall(income: IncomeBreakdown, expense: ExpenseBreakdown): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let running = income.grossRevenueCentavos;
  steps.push({ label: "Gross Revenue", deltaCentavos: income.grossRevenueCentavos, runningTotalCentavos: running });
  const push = (label: string, amountCentavos: number) => {
    running -= amountCentavos;
    steps.push({ label, deltaCentavos: -amountCentavos, runningTotalCentavos: running });
  };
  if (income.discountGivenCentavos > 0) push("Discounts", income.discountGivenCentavos);
  push("Booker Commissions", expense.payroll.bookerCommissionsCentavos);
  push("Utilities & Water", expense.variable.electricityCentavos + expense.variable.waterCentavos);
  push("Marketing", expense.variable.marketingCentavos);
  push("Operational (supplies, cleaning, misc.)", expense.variable.operationalCentavos);
  push("Payroll (salary)", expense.payroll.salaryCentavos);
  push("Fixed Costs (amortization, internet, dues, subscriptions, other)", expense.fixed.totalCentavos);
  steps.push({ label: "Net Profit", deltaCentavos: running, runningTotalCentavos: running });
  return steps;
}

// ---------------------------------------------------------------------
// Break-even analysis — brief section 6.
// ---------------------------------------------------------------------

export type BreakEvenResult = {
  fixedCostsCentavos: number;
  contributionMarginPct: number; // (avg revenue per booking - avg variable cost per booking) / avg revenue per booking
  breakEvenRevenueCentavos: number;
  breakEvenBookings: number;
  breakEvenOccupancyPct: number;
  breakEvenAdrCentavos: number;
  breakEvenRevenuePerUnitCentavos: number;
};

export function computeBreakEven(params: {
  fixedCostsCentavos: number; // Fixed + Payroll — the costs owed regardless of how many bookings occur
  totalVariableCostsCentavos: number;
  bookingCount: number;
  grossRevenueCentavos: number;
  unitCount: number;
  availableNights: number;
  currentAdrCentavos: number;
}): BreakEvenResult {
  const { fixedCostsCentavos, totalVariableCostsCentavos, bookingCount, grossRevenueCentavos, unitCount, availableNights, currentAdrCentavos } = params;
  const avgRevenuePerBooking = bookingCount > 0 ? grossRevenueCentavos / bookingCount : 0;
  const avgVariableCostPerBooking = bookingCount > 0 ? totalVariableCostsCentavos / bookingCount : 0;
  const contributionMarginPct = avgRevenuePerBooking > 0 ? (avgRevenuePerBooking - avgVariableCostPerBooking) / avgRevenuePerBooking : 0;
  const breakEvenRevenueCentavos = contributionMarginPct > 0 ? Math.round(fixedCostsCentavos / contributionMarginPct) : 0;
  const breakEvenBookings = avgRevenuePerBooking > 0 ? Math.ceil(breakEvenRevenueCentavos / avgRevenuePerBooking) : 0;
  const breakEvenNights = currentAdrCentavos > 0 ? breakEvenRevenueCentavos / currentAdrCentavos : 0;
  const breakEvenOccupancyPct = availableNights > 0 ? Math.min(100, Math.round((breakEvenNights / availableNights) * 100)) : 0;
  return {
    fixedCostsCentavos,
    contributionMarginPct: Math.round(contributionMarginPct * 1000) / 10, // one decimal, e.g. 63.5
    breakEvenRevenueCentavos,
    breakEvenBookings,
    breakEvenOccupancyPct,
    breakEvenAdrCentavos: currentAdrCentavos,
    breakEvenRevenuePerUnitCentavos: unitCount > 0 ? Math.round(breakEvenRevenueCentavos / unitCount) : 0,
  };
}

// ---------------------------------------------------------------------
// Contribution margin by dimension — brief section 7. Variable cost is
// allocated pro-rata by each dimension's share of total bookings — the
// simplest defensible allocation with no per-booking variable-cost data
// to allocate more precisely than that.
// ---------------------------------------------------------------------

export type ContributionRow = { key: string; label: string; grossCentavos: number; bookings: number; variableCostCentavos: number; contributionCentavos: number; contributionMarginPct: number };

export function computeContributionByDimension(
  bookings: DimensionBooking[],
  dimension: "unit" | "source" | "stayType",
  totalVariableCostsCentavos: number,
  totalBookingCount: number,
  unitLabels: Record<string, string> = {}
): ContributionRow[] {
  const rows = revenueByDimension(bookings, dimension, unitLabels);
  const costPerBooking = totalBookingCount > 0 ? totalVariableCostsCentavos / totalBookingCount : 0;
  return rows.map((r) => {
    const variableCostCentavos = Math.round(costPerBooking * r.count);
    const contributionCentavos = r.grossCentavos - variableCostCentavos;
    return {
      key: r.key,
      label: r.label,
      grossCentavos: r.grossCentavos,
      bookings: r.count,
      variableCostCentavos,
      contributionCentavos,
      contributionMarginPct: r.grossCentavos > 0 ? Math.round((contributionCentavos / r.grossCentavos) * 1000) / 10 : 0,
    };
  });
}

// ---------------------------------------------------------------------
// Unit economics — brief section 8. Extends unitPerformance()'s rows
// (the existing, already-correct per-unit direct revenue/expenses) with
// a pro-rata share of portfolio-wide shared costs — never recomputes
// per-unit revenue/occupancy/ADR/RevPAR a second time.
// ---------------------------------------------------------------------

export type UnitEconomicsRow = UnitPerformanceRow & {
  occupiedNights: number;
  allocatedSharedCostsCentavos: number; // this unit's equal share of Fixed + Payroll + portfolio Variable costs
  fullyLoadedProfitCentavos: number; // revenue - direct unit expenses - allocated shared costs
  fullyLoadedMarginPct: number;
  profitPerOccupiedNightCentavos: number;
  breakEvenOccupancyPct: number; // occupancy this unit alone needs to cover its allocated shared costs at its own ADR
};

export function computeUnitEconomics(
  unitRows: UnitPerformanceRow[],
  bookings: ProfitBooking[],
  totalSharedCostsCentavos: number,
  periodStart: Date,
  periodEnd: Date
): UnitEconomicsRow[] {
  if (unitRows.length === 0) return [];
  const sharedPerUnit = Math.round(totalSharedCostsCentavos / unitRows.length);
  const availableNightsInPeriod = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));

  return unitRows.map((u) => {
    const unitBookings = bookings.filter((b) => b.unitId === u.unitId && !b.cancelledAt);
    const occupiedDays = new Set<string>();
    for (const b of unitBookings) {
      const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
      const s = Math.max(start.getTime(), periodStart.getTime());
      const e = Math.min(end.getTime(), periodEnd.getTime());
      for (let t = s; t < e; t += 86400000) occupiedDays.add(new Date(t).toISOString().slice(0, 10));
    }
    const occupiedNights = occupiedDays.size;
    const fullyLoadedProfitCentavos = u.revenueCentavos - u.expensesCentavos - sharedPerUnit;
    const breakEvenNights = u.adrCentavos > 0 ? sharedPerUnit / u.adrCentavos : 0;
    return {
      ...u,
      occupiedNights,
      allocatedSharedCostsCentavos: sharedPerUnit,
      fullyLoadedProfitCentavos,
      fullyLoadedMarginPct: marginPct(fullyLoadedProfitCentavos, u.revenueCentavos),
      profitPerOccupiedNightCentavos: occupiedNights > 0 ? Math.round(fullyLoadedProfitCentavos / occupiedNights) : 0,
      breakEvenOccupancyPct: Math.min(100, Math.round((breakEvenNights / availableNightsInPeriod) * 100)),
    };
  });
}

// ---------------------------------------------------------------------
// Booker profitability — brief sections 9-10. Real net profit, not the
// revenue-only proxy forecastEngine.ts/campaignEngine deliberately use
// elsewhere — see module doc comment for why this section differs.
// ---------------------------------------------------------------------

export type BookerProfitRow = {
  employeeId: string;
  name: string;
  bookings: number;
  grossRevenueCentavos: number;
  commissionCentavos: number;
  discountGivenCentavos: number;
  netProfitCentavos: number; // gross - commission (discount is already inside gross via amount, shown separately for visibility only)
  profitPerBookingCentavos: number;
  avgBookingValueCentavos: number;
  cancellationRatePct: number;
  volumeVsProfitFlag: "aligned" | "high_volume_low_profit"; // flags "high booking volume != high profitability"
};

export function computeBookerProfitability(
  bookers: { employeeId: string; name: string }[],
  bookings: ProfitBooking[],
  bookerCommissionPesos: number
): BookerProfitRow[] {
  const rows: BookerProfitRow[] = bookers.map((booker) => {
    const own = bookings.filter((b) => b.bookerId === booker.employeeId);
    const active = own.filter((b) => !b.cancelledAt);
    const bookingsCount = active.length;
    const grossRevenueCentavos = active.reduce((s, b) => s + grossAmountCentavos(b), 0);
    const commissionEligibleCount = own.filter((b) => isCommissionEligible(b)).length;
    const commissionCentavos = commissionEligibleCount * bookerCommissionPesos * 100;
    const discountGivenCentavos = active.reduce((s, b) => (b.originalAmount != null && b.originalAmount > b.amount ? s + (b.originalAmount - b.amount) * 100 : s), 0);
    const netProfitCentavosValue = grossRevenueCentavos - commissionCentavos;
    const totalAttempts = own.length;
    const cancelledCount = own.filter((b) => b.cancelledAt).length;
    return {
      employeeId: booker.employeeId,
      name: booker.name,
      bookings: bookingsCount,
      grossRevenueCentavos,
      commissionCentavos,
      discountGivenCentavos,
      netProfitCentavos: netProfitCentavosValue,
      profitPerBookingCentavos: bookingsCount > 0 ? Math.round(netProfitCentavosValue / bookingsCount) : 0,
      avgBookingValueCentavos: bookingsCount > 0 ? Math.round(grossRevenueCentavos / bookingsCount) : 0,
      cancellationRatePct: totalAttempts > 0 ? Math.round((cancelledCount / totalAttempts) * 100) : 0,
      volumeVsProfitFlag: "aligned" as const,
    };
  });
  // Flag "high volume, low profit": top-3-by-volume but bottom-half-by-profit-per-booking.
  const byVolume = [...rows].sort((a, b) => b.bookings - a.bookings);
  const medianProfitPerBooking = [...rows].map((r) => r.profitPerBookingCentavos).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0;
  for (const r of byVolume.slice(0, 3)) {
    if (r.bookings > 0 && r.profitPerBookingCentavos < medianProfitPerBooking) r.volumeVsProfitFlag = "high_volume_low_profit";
  }
  return rows.sort((a, b) => b.netProfitCentavos - a.netProfitCentavos);
}

// ---------------------------------------------------------------------
// Booking source profitability — brief section 11. Gross-only for every
// source (see module doc comment) — "contribution" here nets out real
// per-booking variable cost (pro-rata allocated, same method as
// computeContributionByDimension) but never a fabricated platform fee.
// ---------------------------------------------------------------------

export type SourceProfitRow = { source: string; bookings: number; grossRevenueCentavos: number; contributionCentavos: number; contributionMarginPct: number; revenueRank: number; profitRank: number };

export function computeSourceProfitability(bookings: DimensionBooking[], totalVariableCostsCentavos: number, totalBookingCount: number): SourceProfitRow[] {
  const contributionRows = computeContributionByDimension(bookings, "source", totalVariableCostsCentavos, totalBookingCount);
  const byRevenue = [...contributionRows].sort((a, b) => b.grossCentavos - a.grossCentavos);
  const byProfit = [...contributionRows].sort((a, b) => b.contributionCentavos - a.contributionCentavos);
  const revenueRankOf = new Map(byRevenue.map((r, i) => [r.key, i + 1]));
  const profitRankOf = new Map(byProfit.map((r, i) => [r.key, i + 1]));
  return contributionRows
    .map((r) => ({
      source: r.label,
      bookings: r.bookings,
      grossRevenueCentavos: r.grossCentavos,
      contributionCentavos: r.contributionCentavos,
      contributionMarginPct: r.contributionMarginPct,
      revenueRank: revenueRankOf.get(r.key) ?? 0,
      profitRank: profitRankOf.get(r.key) ?? 0,
    }))
    .sort((a, b) => b.contributionCentavos - a.contributionCentavos);
}

// ---------------------------------------------------------------------
// Business Health Verdict — brief section 1. A deterministic decision
// tree over real, already-computed figures — never a vibe. Every band
// is reachable only through explicit numeric thresholds so the same
// inputs always produce the same verdict.
// ---------------------------------------------------------------------

export type HealthBand = "winning" | "surviving" | "at_risk" | "losing" | "unsustainable";
export type HealthVerdict = { band: HealthBand; headline: string; reasons: string[] };

export function computeBusinessHealthVerdict(params: {
  operatingMarginPct: number;
  economicMarginPct: number;
  revenueGrowthPct: number | null;
  expenseGrowthPct: number | null;
  occupancyPct: number;
  breakEvenOccupancyPct: number;
  cancellationRatePct: number;
  fixedCostToRevenuePct: number;
}): HealthVerdict {
  const { operatingMarginPct, economicMarginPct, revenueGrowthPct, expenseGrowthPct, occupancyPct, breakEvenOccupancyPct, cancellationRatePct, fixedCostToRevenuePct } = params;
  const reasons: string[] = [];
  const marginCompressing = revenueGrowthPct !== null && expenseGrowthPct !== null && expenseGrowthPct > revenueGrowthPct + 3;
  const belowBreakEven = occupancyPct < breakEvenOccupancyPct;

  if (economicProfitIsNegative(economicMarginPct)) {
    reasons.push(`Economic profit margin is ${economicMarginPct}% — negative even after real, already-incurred obligations are counted.`);
    if (operatingMarginPct <= 0) {
      reasons.push(`Operating profit margin is also ${operatingMarginPct}% — the business is not covering its true operating costs from revenue alone.`);
      return { band: "losing", headline: "You are losing money.", reasons };
    }
    return { band: "at_risk", headline: "Revenue looks fine, but the underlying economics don't hold up once every real obligation is counted.", reasons };
  }

  if (belowBreakEven) reasons.push(`Occupancy (${occupancyPct}%) is below the break-even occupancy (${breakEvenOccupancyPct}%) this period requires.`);
  if (marginCompressing) reasons.push(`Expenses are growing faster than revenue (${expenseGrowthPct}% vs ${revenueGrowthPct}%) — margin compression.`);
  if (fixedCostToRevenuePct > 40) reasons.push(`Fixed costs are ${fixedCostToRevenuePct}% of revenue — high fixed-cost pressure.`);
  if (cancellationRatePct > 15) reasons.push(`Cancellation rate is ${cancellationRatePct}% — eroding confirmed revenue before it's realized.`);

  if (belowBreakEven || (marginCompressing && fixedCostToRevenuePct > 40)) {
    return { band: "at_risk", headline: "The business may appear profitable, but structural problems put that at risk.", reasons };
  }
  if (operatingMarginPct < 15 || marginCompressing || cancellationRatePct > 15) {
    if (reasons.length === 0) reasons.push(`Operating margin is ${operatingMarginPct}% — thin enough that a small cost increase could erase profit.`);
    return { band: "surviving", headline: "You are profitable, but fragile — here is what could destroy the margin.", reasons };
  }
  reasons.push(`Operating margin is a healthy ${operatingMarginPct}%, revenue growth (${revenueGrowthPct ?? 0}%) is outpacing expense growth (${expenseGrowthPct ?? 0}%).`);
  return { band: "winning", headline: "You are winning — here is what could destroy the margin if it changes.", reasons };
}

function economicProfitIsNegative(economicMarginPct: number): boolean {
  return economicMarginPct < 0;
}

// ---------------------------------------------------------------------
// Red flags — brief section 21. Each flag fires only on a real,
// explicit threshold against real computed figures.
// ---------------------------------------------------------------------

export type RedFlag = { label: string; detail: string };

export function computeRedFlags(params: {
  revenueGrowthPct: number | null;
  expenseGrowthPct: number | null;
  marginTrendPct: number | null; // this period's margin - previous period's margin
  operatingProfitCentavos: number;
  economicProfitCentavos: number;
  occupancyPct: number;
  breakEvenOccupancyPct: number;
  adrCentavos: number;
  breakEvenAdrCentavos: number;
  topSourceRevenueSharePct: number;
  cancellationRatePct: number;
  utilityToRevenuePct: number;
  payrollToRevenuePct: number;
  discountToGrossPct: number;
  fixedCostToRevenuePct: number;
  targetProbabilityPct: number | null;
  projectedRevenueBelowBreakEven: boolean;
  underperformingUnits: string[];
  lowProfitHighVolumeBookers: string[];
  lowContributionHighRevenueSources: string[];
}): RedFlag[] {
  const flags: RedFlag[] = [];
  const p = params;
  if (p.revenueGrowthPct !== null && p.revenueGrowthPct < 0) flags.push({ label: "Revenue declining", detail: `Revenue is down ${Math.abs(p.revenueGrowthPct)}% vs the prior period.` });
  if (p.revenueGrowthPct !== null && p.expenseGrowthPct !== null && p.expenseGrowthPct > p.revenueGrowthPct) flags.push({ label: "Expenses growing faster than revenue", detail: `Expenses +${p.expenseGrowthPct}% vs revenue +${p.revenueGrowthPct}%.` });
  if (p.marginTrendPct !== null && p.marginTrendPct < -2) flags.push({ label: "Profit margin declining", detail: `Margin is down ${Math.abs(p.marginTrendPct)} points vs the prior period.` });
  if (p.operatingProfitCentavos < 0) flags.push({ label: "Negative operating profit", detail: "Revenue is not covering real operating costs this period." });
  if (p.economicProfitCentavos < 0) flags.push({ label: "Negative economic profit", detail: "Revenue is not covering every real, already-incurred obligation this period." });
  if (p.occupancyPct < p.breakEvenOccupancyPct) flags.push({ label: "Occupancy below break-even", detail: `${p.occupancyPct}% actual vs ${p.breakEvenOccupancyPct}% required.` });
  if (p.adrCentavos < p.breakEvenAdrCentavos * 0.9) flags.push({ label: "ADR too low", detail: "Average rate is meaningfully below the break-even rate." });
  if (p.topSourceRevenueSharePct > 60) flags.push({ label: "High platform dependency", detail: `${p.topSourceRevenueSharePct}% of revenue comes from a single booking source.` });
  if (p.cancellationRatePct > 15) flags.push({ label: "High cancellation rate", detail: `${p.cancellationRatePct}% of bookings are cancelled.` });
  if (p.utilityToRevenuePct > 10) flags.push({ label: "High utility cost", detail: `Utilities + water are ${p.utilityToRevenuePct}% of revenue.` });
  if (p.payrollToRevenuePct > 35) flags.push({ label: "High payroll-to-revenue ratio", detail: `Payroll is ${p.payrollToRevenuePct}% of revenue.` });
  if (p.discountToGrossPct > 10) flags.push({ label: "Excessive discounting", detail: `Discounts given are ${p.discountToGrossPct}% of gross revenue.` });
  if (p.fixedCostToRevenuePct > 40) flags.push({ label: "Fixed costs too high", detail: `Fixed costs are ${p.fixedCostToRevenuePct}% of revenue.` });
  if (p.projectedRevenueBelowBreakEven) flags.push({ label: "Forecast below break-even", detail: "Projected month-end revenue is below the break-even revenue required." });
  if (p.targetProbabilityPct !== null && p.targetProbabilityPct < 30) flags.push({ label: "Target unlikely to be achieved", detail: `Only a ${p.targetProbabilityPct}% modeled chance of hitting this month's target.` });
  for (const u of p.underperformingUnits) flags.push({ label: "Unit underperformance", detail: `${u} is generating disproportionately low profit relative to its peers.` });
  for (const b of p.lowProfitHighVolumeBookers) flags.push({ label: "Booker generating revenue but low profit", detail: `${b} has high booking volume but below-median profit per booking.` });
  for (const s of p.lowContributionHighRevenueSources) flags.push({ label: "Booking source generating revenue but poor contribution", detail: `${s} ranks high on revenue but low on contribution margin.` });
  return flags;
}

// ---------------------------------------------------------------------
// Brutal Truth — brief section 19. Deterministic, template-based, NOT an
// LLM call (same reasoning generateForecastInsights already documents —
// this app's Gemini key has a hard 20-requests/day cap shared across
// several existing AI features). Only fires when the real numbers
// actually support the statement.
// ---------------------------------------------------------------------

export type BrutalTruth = { statement: string };

export function generateBrutalTruths(params: {
  revenueGrowthPct: number | null;
  operatingMarginPct: number;
  previousOperatingMarginPct: number | null;
  occupancyPct: number;
  breakEvenOccupancyPct: number;
  adrCentavos: number;
  breakEvenAdrCentavos: number;
  worstUnitLabel: string | null;
  worstUnitMarginPct: number | null;
  expenseGrowthPct: number | null;
  fixedCostToRevenuePct: number;
}): BrutalTruth[] {
  const truths: BrutalTruth[] = [];
  const p = params;

  if (p.revenueGrowthPct !== null && p.revenueGrowthPct > 0 && p.previousOperatingMarginPct !== null && p.operatingMarginPct < p.previousOperatingMarginPct - 2) {
    truths.push({ statement: `Your revenue is growing (+${p.revenueGrowthPct}%), but your operating margin is declining (${p.previousOperatingMarginPct}% -> ${p.operatingMarginPct}%). You are winning on sales but losing on efficiency.` });
  }
  if (p.occupancyPct >= p.breakEvenOccupancyPct + 10 && p.adrCentavos < p.breakEvenAdrCentavos) {
    truths.push({ statement: `Your occupancy (${p.occupancyPct}%) looks healthy, but your ADR is below what break-even requires. You are filling inventory without extracting enough value from it.` });
  }
  if (p.worstUnitLabel && p.worstUnitMarginPct !== null && p.worstUnitMarginPct < 5) {
    truths.push({ statement: `${p.worstUnitLabel} generates revenue but contributes disproportionately low profit (${p.worstUnitMarginPct}% margin) once its share of shared costs is counted.` });
  }
  if (p.revenueGrowthPct !== null && p.revenueGrowthPct >= 0 && p.expenseGrowthPct !== null && p.expenseGrowthPct > p.revenueGrowthPct + 5) {
    truths.push({ statement: "You do not have a revenue problem. You have a cost-control problem — expenses are growing meaningfully faster than revenue." });
  }
  if (p.fixedCostToRevenuePct > 40) {
    truths.push({ statement: `Your current revenue is not comfortably absorbing your fixed costs — fixed costs are ${p.fixedCostToRevenuePct}% of revenue.` });
  }
  return truths.slice(0, 5);
}

// ---------------------------------------------------------------------
// "If nothing changes" scenario — brief section 16. A straight linear
// extrapolation of this period's own realized daily pace — deliberately
// the simplest, most literal reading of "if we continue doing exactly
// what we're doing," not a second forecasting model competing with
// forecastEngine.ts (which blends trailing-period pace for a *forecast*;
// this is a *status-quo projection*, a different real question).
// ---------------------------------------------------------------------

export type StatusQuoProjection = { months: number; revenueCentavos: number; expensesCentavos: number; profitCentavos: number; marginPct: number };

export function computeStatusQuoProjection(dailyRevenueCentavos: number, dailyExpenseCentavos: number, monthsList: number[] = [1, 3, 6]): StatusQuoProjection[] {
  return monthsList.map((months) => {
    const days = months * 30;
    const revenueCentavos = Math.round(dailyRevenueCentavos * days);
    const expensesCentavos = Math.round(dailyExpenseCentavos * days);
    const profitCentavos = revenueCentavos - expensesCentavos;
    return { months, revenueCentavos, expensesCentavos, profitCentavos, marginPct: marginPct(profitCentavos, revenueCentavos) };
  });
}

// ---------------------------------------------------------------------
// Top-leverage actions — brief sections 18/20. Five fixed, real-formula
// candidate levers, ranked by actual computed monthly impact — never a
// generic tip with no number behind it.
// ---------------------------------------------------------------------

export type ActionRecommendation = {
  title: string;
  problem: string;
  evidence: string;
  recommendedAction: string;
  estimatedMonthlyImpactCentavos: number;
  difficulty: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
};

export function computeTopActions(params: {
  weekendOccupancyPct: number;
  weekdayOccupancyPct: number;
  weekdayAvailableNightsPerMonth: number;
  adrCentavos: number;
  occupiedNightsPerMonth: number;
  operationalCentavosPerBooking: number;
  bookingsPerMonth: number;
  cancellationRatePct: number;
  cancelledBookingsPerMonth: number;
  worstSourceLabel: string | null;
  worstSourceContributionMarginPct: number | null;
  worstSourceRevenueCentavos: number | null;
}): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];
  const p = params;

  const adrLiftImpact = Math.round(10000 * p.occupiedNightsPerMonth); // +₱100 ADR x occupied nights/month
  actions.push({
    title: "Raise ADR by ₱100 on your highest-demand nights",
    problem: "Weekend/high-demand nights are priced the same as low-demand nights, leaving real willingness-to-pay on the table.",
    evidence: `${p.occupiedNightsPerMonth} occupied room-nights/month at the current ADR.`,
    recommendedAction: "Increase the rate by ₱100 on nights that already run near-full.",
    estimatedMonthlyImpactCentavos: adrLiftImpact,
    difficulty: "low",
    risk: "low",
  });

  if (p.weekdayOccupancyPct < p.weekendOccupancyPct - 10) {
    const gapNights = Math.round((p.weekendOccupancyPct - p.weekdayOccupancyPct) / 100 * p.weekdayAvailableNightsPerMonth * 0.5); // half the gap, closable
    actions.push({
      title: "Close the weekday occupancy gap",
      problem: `Weekday occupancy (${p.weekdayOccupancyPct}%) trails weekend occupancy (${p.weekendOccupancyPct}%) by ${p.weekendOccupancyPct - p.weekdayOccupancyPct} points.`,
      evidence: `${p.weekdayAvailableNightsPerMonth} weekday room-nights/month currently unsold at that gap.`,
      recommendedAction: "Run a weekday-specific promotion or discount to lift weekday bookings.",
      estimatedMonthlyImpactCentavos: Math.round(gapNights * p.adrCentavos),
      difficulty: "medium",
      risk: "low",
    });
  }

  if (p.operationalCentavosPerBooking > 0) {
    const impact = Math.round(5000 * p.bookingsPerMonth); // -₱50/booking x bookings/month
    actions.push({
      title: "Reduce operational cost by ₱50 per booking",
      problem: "Operational/supplies cost per booking has real room to shrink through bulk purchasing or vendor renegotiation.",
      evidence: `${p.bookingsPerMonth} bookings/month at the current operational cost per booking.`,
      recommendedAction: "Renegotiate supply costs or consolidate vendors.",
      estimatedMonthlyImpactCentavos: impact,
      difficulty: "low",
      risk: "low",
    });
  }

  if (p.cancellationRatePct > 10) {
    const impact = Math.round(p.cancelledBookingsPerMonth * 0.3 * p.adrCentavos * 2); // recovering 30% of cancellations at ~2 nights avg
    actions.push({
      title: "Reduce cancellation rate",
      problem: `${p.cancellationRatePct}% of bookings are cancelled, each one a lost confirmed booking.`,
      evidence: `${p.cancelledBookingsPerMonth} cancellations/month.`,
      recommendedAction: "Tighten deposit/cancellation policy or follow up on at-risk bookings earlier.",
      estimatedMonthlyImpactCentavos: impact,
      difficulty: "medium",
      risk: "medium",
    });
  }

  if (p.worstSourceLabel && p.worstSourceContributionMarginPct !== null && p.worstSourceContributionMarginPct < 30 && p.worstSourceRevenueCentavos) {
    actions.push({
      title: `Reduce reliance on ${p.worstSourceLabel}`,
      problem: `${p.worstSourceLabel} has the lowest contribution margin (${p.worstSourceContributionMarginPct}%) of any source.`,
      evidence: `${p.worstSourceLabel} generates real revenue but converts a below-average share of it into contribution profit.`,
      recommendedAction: "Shift marketing effort toward higher-contribution sources.",
      estimatedMonthlyImpactCentavos: Math.round(p.worstSourceRevenueCentavos * 0.1),
      difficulty: "medium",
      risk: "medium",
    });
  }

  return actions.sort((a, b) => b.estimatedMonthlyImpactCentavos - a.estimatedMonthlyImpactCentavos).slice(0, 5);
}
