// Single source of truth for the "Your team" payroll formula, shared by the
// Dashboard's read-only summary and the Admin Weekly Report's full editor —
// previously duplicated near-verbatim in both places with hardcoded rates.

import { isCommissionEligible } from "@/lib/bookingStatus";

export type PayrollRates = {
  housekeepingDayRate: number;
  housekeepingNightBonus: number;
  bookerCommission: number;
  auditorWeeklyRate: number;
};

export type TeamLineItem = { label: string; detail: string; amount: number; deduction?: boolean };

type NormalizedBooking = { bookerId: string | null; cleanerId: string | null; unitId: string; stayType: string; date: string; checkOutDate: string | null; checkOutTime: string | null; checkInTime?: string | null; paid: boolean; cancelledAt?: string | null; dpAmount?: number | null; refundedAt?: string | null };
type NormalizedExpense = { note: string; amount: number; targetEmployeeId: string | null };
/** An Admin-approved ExpenseRequest — money this employee is owed back for
 * a business expense they paid out of pocket (TikTok ads, a unit repair),
 * not a deduction. employeeId here is the requester, distinct from
 * WeeklyExpense's targetEmployeeId (someone else logging a charge against
 * them). */
type NormalizedExpenseRequest = { employeeId: string; note: string; amount: number };

/** Roles the "Your team" payroll list includes at all. */
export function isPayrollRole(role: string) {
  return role === "HOUSEKEEPING" || role === "BOOKER" || role === "AUDITOR";
}

export function computeTeamBreakdown(
  emp: { id: string; role: string; fixedSalaryCoversCleaning?: boolean },
  params: {
    cleaningDays: number;
    weekBookings: NormalizedBooking[];
    weekExpenses: NormalizedExpense[];
    weekExpenseRequests?: NormalizedExpenseRequest[];
    rates: PayrollRates;
    periodWeeks?: number;
    /** Portfolio-wide night-bonus inputs (optional, backward-compatible —
     * when omitted, HOUSEKEEPING falls back to the old same-unit/day≥2 rule
     * below). When supplied, replaces that rule with the real business rule:
     * a ₱ bonus per additional cleaning beyond one-per-unit that day
     * (totalCleaningsThatDay > totalUnits), gated to cleanings that checked
     * out at/after 5PM. `portfolioBookings` must be ALL housekeeping-cleaned
     * bookings for the period (every employee, not just this one) so the
     * "total cleanings that day" count is real, not just this employee's
     * share of it. */
    portfolioBookings?: NormalizedBooking[];
    totalUnits?: number;
  }
): { total: number; items: TeamLineItem[]; subtitle: string } {
  const { cleaningDays, weekBookings, weekExpenses, weekExpenseRequests = [], rates, portfolioBookings, totalUnits } = params;
  // How many weeks the caller's booking/expense window actually spans —
  // 1 for the default "this week" case. Only the Auditor's flat weekly rate
  // needs this: every other line here (day-rate × cleaning days, commission
  // × bookings, logged "Salary" expenses) already scales correctly just by
  // the caller passing a wider or narrower window, since it's counting real
  // activity within whatever range was given, not applying its own rate.
  const periodWeeks = params.periodWeeks ?? 1;
  const items: TeamLineItem[] = [];
  let roleSubtitle = "";

  if (emp.role === "HOUSEKEEPING") {
    // Justine (and anyone else flagged this way): fixed salary already pays
    // for regular day-to-day cleaning, so no separate day-rate line — only
    // qualifying Night Clean Bonuses show up as activity income for them.
    if (!emp.fixedSalaryCoversCleaning) {
      const regularPay = cleaningDays * rates.housekeepingDayRate;
      if (cleaningDays > 0) {
        items.push({ label: "Regular pay", detail: `₱${rates.housekeepingDayRate}/day × ${cleaningDays} day${cleaningDays !== 1 ? "s" : ""}`, amount: regularPay });
      }
    }

    let incentiveCount = 0;
    let bonusDetail = "";
    if (portfolioBookings && typeof totalUnits === "number") {
      // Real rule (as specified): a cleaning qualifies when (1) its
      // booking's check-in time is at/after 5PM, AND (2) that calendar day's
      // total portfolio cleanings exceed the number of available units —
      // i.e. at least one unit got turned over more than once that day, and
      // this was one of the late check-ins that forced the rushed turnover.
      // Each employee's qualifying count is capped at how many "extra"
      // cleanings the whole portfolio actually had that day, so the bonus
      // pool for a day can never exceed the real number of above-one-per-
      // unit cleanings, no matter how many staff worked it.
      const allCleaningsByDay = new Map<string, number>();
      const myEveningCleaningsByDay = new Map<string, number>();
      for (const b of portfolioBookings) {
        if (b.cancelledAt || !b.cleanerId) continue;
        const day = (b.checkOutDate ?? b.date).slice(0, 10);
        allCleaningsByDay.set(day, (allCleaningsByDay.get(day) ?? 0) + 1);
        if (b.cleanerId === emp.id && !!b.checkInTime && b.checkInTime >= "17:00") {
          myEveningCleaningsByDay.set(day, (myEveningCleaningsByDay.get(day) ?? 0) + 1);
        }
      }
      for (const [day, mine] of myEveningCleaningsByDay) {
        const extraThatDay = Math.max(0, (allCleaningsByDay.get(day) ?? 0) - totalUnits);
        incentiveCount += Math.min(mine, extraThatDay);
      }
      bonusDetail = `₱${rates.housekeepingNightBonus} × ${incentiveCount} additional cleaning${incentiveCount !== 1 ? "s" : ""} (check-in 5PM+, on a day total cleanings exceeded available units)`;
      roleSubtitle = emp.fixedSalaryCoversCleaning
        ? `fixed salary + ₱${rates.housekeepingNightBonus} per qualifying Night Clean Bonus`
        : `₱${rates.housekeepingDayRate}/day + ₱${rates.housekeepingNightBonus} per qualifying Night Clean Bonus`;
    } else {
      // Legacy fallback (no portfolio-wide data supplied by this caller):
      // once per unit per calendar day, if this employee alone cleaned 2+
      // bookings for that SAME unit checking out at/after 5PM that day.
      const eveningCleansByUnitDay = new Map<string, number>();
      weekBookings
        .filter((b) => b.cleanerId === emp.id && !b.cancelledAt && !!b.checkOutTime && b.checkOutTime >= "17:00")
        .forEach((b) => {
          const day = (b.checkOutDate ?? b.date).slice(0, 10);
          const key = `${b.unitId}::${day}`;
          eveningCleansByUnitDay.set(key, (eveningCleansByUnitDay.get(key) ?? 0) + 1);
        });
      incentiveCount = [...eveningCleansByUnitDay.values()].filter((n) => n >= 2).length;
      bonusDetail = `₱${rates.housekeepingNightBonus} × ${incentiveCount} (unit, day) (2+ bookings after 5PM, same unit)`;
      roleSubtitle = `₱${rates.housekeepingDayRate}/day + ₱${rates.housekeepingNightBonus} evening incentive (2+ bookings after 5PM, same unit/day)`;
    }
    const bonus = incentiveCount * rates.housekeepingNightBonus;
    if (incentiveCount > 0) {
      items.push({ label: "Night Clean Bonus", detail: bonusDetail, amount: bonus });
    }
  } else if (emp.role === "AUDITOR") {
    const auditorAmount = Math.round(rates.auditorWeeklyRate * periodWeeks);
    if (auditorAmount > 0) {
      items.push({
        label: "Weekly rate",
        detail: periodWeeks === 1 ? "flat rate" : `₱${rates.auditorWeeklyRate}/week × ${periodWeeks.toFixed(1)} wk`,
        amount: auditorAmount,
      });
    }
    roleSubtitle = `₱${rates.auditorWeeklyRate}/week`;
  }

  // Booking commission — whoever is set as the booker earns this the moment
  // the booking is fully paid (no more waiting for checkout), and it stays
  // earned even if the booking is later cancelled, as long as the money
  // wasn't refunded — see isCommissionEligible for the exact rule. Applies
  // to anyone who logs a booking regardless of their primary role — a
  // Housekeeping or Auditor staffer who books a guest earns the same rate a
  // dedicated Booker would, since they did the same work.
  const commissionEligible = weekBookings.filter((b) => b.bookerId === emp.id && isCommissionEligible(b));
  if (commissionEligible.length > 0) {
    items.push({
      label: "Booking commission",
      detail: `₱${rates.bookerCommission} × ${commissionEligible.length} booking${commissionEligible.length !== 1 ? "s" : ""} (paid, or cancelled with the deposit kept)`,
      amount: commissionEligible.length * rates.bookerCommission,
    });
  }
  const subtitle = [roleSubtitle, `₱${rates.bookerCommission}/booking (paid, or cancelled with the deposit kept)`].filter(Boolean).join(" + ");

  // Manual weekly expenses charged to this employee — ad boosts and similar
  // one-off deductions logged against them. The old flat-rate "Weekly
  // salary" top-up (a manually-logged WeeklyExpense with note "Salary") is
  // deliberately no longer read here: base pay comes from the employee's
  // own salaryType/salaryRate (Owner Summary), and activity income comes
  // from Booking commission above — automatically credited once a booking
  // is paid in full and checked out, with no manual top-up step needed.
  const empExpenses = weekExpenses.filter((e) => e.targetEmployeeId === emp.id);
  empExpenses.filter((e) => e.note !== "Salary").forEach((e) => items.push({ label: e.note, detail: "deducted this week", amount: e.amount, deduction: true }));

  // Approved expense requests — money owed BACK to this employee for a
  // business cost they covered themselves (a TikTok ad boost, a unit
  // repair), not a deduction, so it adds to the total rather than
  // subtracting like the WeeklyExpense charges above.
  weekExpenseRequests
    .filter((r) => r.employeeId === emp.id)
    .forEach((r) => items.push({ label: r.note, detail: "approved expense reimbursement", amount: r.amount }));

  const total = items.reduce((s, i) => s + (i.deduction ? -i.amount : i.amount), 0);
  return { total, items, subtitle };
}

// ── Monthly-salary payroll (separate from the commission-based formula
// above) — a flat rate per staff member, auto-scaled to whatever reporting
// period is selected, with point-in-time salary history so editing today's
// rate never rewrites a past period's numbers. ──

export type DashboardPeriodType = "daily" | "weekly" | "monthly" | "yearly" | "custom";

export type SalaryHistoryEntry = { employeeId: string; monthlySalary: number; effectiveDate: string };

export type SalaryType = "DAILY" | "WEEKLY" | "MONTHLY";

/** What Admin actually edits — a rate at whatever cadence fits how someone's paid — converted to its monthly equivalent, the one figure every period-scaled payroll calculation reads. */
export function monthlySalaryFromRate(salaryType: SalaryType, salaryRate: number): number {
  switch (salaryType) {
    case "DAILY": return Math.round((salaryRate * 365) / 12);
    case "WEEKLY": return Math.round((salaryRate * 52) / 12);
    case "MONTHLY": return salaryRate;
  }
}

/** Weekly Salary = (Monthly Salary × 12) ÷ 52 — always derived, never stored. */
export function weeklySalaryFor(monthlySalary: number): number {
  return (monthlySalary * 12) / 52;
}

/** Scales a monthly salary to the given reporting period. `days` is required for "custom". */
export function salaryForPeriod(monthlySalary: number, period: DashboardPeriodType, days?: number): number {
  const annual = monthlySalary * 12;
  switch (period) {
    case "daily": return annual / 365;
    case "weekly": return annual / 52;
    case "monthly": return monthlySalary;
    case "yearly": return annual;
    case "custom": return (annual / 365) * (days ?? 0);
  }
}

/** The salary actually in effect for a given employee as of a point in time — the most recent history entry at or before `asOf`, falling back to their current rate if no history predates it (e.g. a brand-new hire). */
export function effectiveMonthlySalary(employeeId: string, currentMonthlySalary: number, history: SalaryHistoryEntry[], asOf: Date): number {
  let best: SalaryHistoryEntry | null = null;
  for (const h of history) {
    if (h.employeeId !== employeeId) continue;
    const at = new Date(h.effectiveDate);
    if (at <= asOf && (!best || at > new Date(best.effectiveDate))) best = h;
  }
  return best ? best.monthlySalary : currentMonthlySalary;
}

/** Total salary payroll for a set of active employees over a reporting period, using each employee's historically-effective rate. */
export function totalSalaryPayroll(
  employees: { id: string; role: string; monthlySalary: number; active?: boolean }[],
  history: SalaryHistoryEntry[],
  period: DashboardPeriodType,
  periodStart: Date,
  days?: number
): number {
  // Owners and Co-owners are never part of payroll — excluded here too so
  // Net Profit's "staff salaries" deduction can't be inflated by an owner's
  // own rate field, even if one gets set on their Staff record.
  return employees
    .filter((e) => e.active !== false && isPayrollRole(e.role))
    .reduce((sum, e) => sum + salaryForPeriod(effectiveMonthlySalary(e.id, e.monthlySalary, history, periodStart), period, days), 0);
}
