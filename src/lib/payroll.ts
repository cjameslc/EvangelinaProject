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

type NormalizedBooking = { bookerId: string | null; cleanerId: string | null; unitId: string; stayType: string; date: string; checkOutDate: string | null; checkOutTime: string | null; paid: boolean; cancelledAt?: string | null; dpAmount?: number | null; refundedAt?: string | null };
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
  emp: { id: string; role: string },
  params: { cleaningDays: number; weekBookings: NormalizedBooking[]; weekExpenses: NormalizedExpense[]; weekExpenseRequests?: NormalizedExpenseRequest[]; rates: PayrollRates; periodWeeks?: number }
): { total: number; items: TeamLineItem[]; subtitle: string } {
  const { cleaningDays, weekBookings, weekExpenses, weekExpenseRequests = [], rates } = params;
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
    const regularPay = cleaningDays * rates.housekeepingDayRate;
    if (cleaningDays > 0) {
      items.push({ label: "Regular pay", detail: `₱${rates.housekeepingDayRate}/day × ${cleaningDays} day${cleaningDays !== 1 ? "s" : ""}`, amount: regularPay });
    }
    // Evening incentive: a flat bonus, once per unit per calendar day, if
    // this employee cleaned 2 or more bookings for that SAME unit that
    // checked out at or after 5:00 PM that same day — scoped per unit, so
    // two different units each hitting the threshold the same day both
    // earn their own bonus; not scaled by how many qualified beyond 2.
    const eveningCleansByUnitDay = new Map<string, number>();
    weekBookings
      .filter((b) => b.cleanerId === emp.id && !b.cancelledAt && !!b.checkOutTime && b.checkOutTime >= "17:00")
      .forEach((b) => {
        const day = (b.checkOutDate ?? b.date).slice(0, 10);
        const key = `${b.unitId}::${day}`;
        eveningCleansByUnitDay.set(key, (eveningCleansByUnitDay.get(key) ?? 0) + 1);
      });
    const incentiveUnitDays = [...eveningCleansByUnitDay.values()].filter((n) => n >= 2).length;
    const bonus = incentiveUnitDays * rates.housekeepingNightBonus;
    if (incentiveUnitDays > 0) {
      items.push({ label: "Evening incentive", detail: `₱${rates.housekeepingNightBonus} × ${incentiveUnitDays} (unit, day) (2+ bookings after 5PM, same unit)`, amount: bonus });
    }
    roleSubtitle = `₱${rates.housekeepingDayRate}/day + ₱${rates.housekeepingNightBonus} evening incentive (2+ bookings after 5PM, same unit/day)`;
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
