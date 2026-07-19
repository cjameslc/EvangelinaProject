// Single source of truth for the "Your team" payroll formula, shared by the
// Dashboard's read-only summary and the Admin Weekly Report's full editor —
// previously duplicated near-verbatim in both places with hardcoded rates.

export type PayrollRates = {
  housekeepingDayRate: number;
  housekeepingNightBonus: number;
  bookerCommission: number;
  auditorWeeklyRate: number;
};

export type TeamLineItem = { label: string; detail: string; amount: number; deduction?: boolean };

type NormalizedBooking = { bookerId: string | null; cleanerId: string | null; stayType: string };
type NormalizedExpense = { note: string; amount: number; targetEmployeeId: string | null };

/** Roles the "Your team" payroll list includes at all. */
export function isPayrollRole(role: string) {
  return role === "HOUSEKEEPING" || role === "BOOKER" || role === "AUDITOR";
}

export function computeTeamBreakdown(
  emp: { id: string; role: string },
  params: { cleaningDays: number; weekBookings: NormalizedBooking[]; weekExpenses: NormalizedExpense[]; rates: PayrollRates; periodWeeks?: number }
): { total: number; items: TeamLineItem[]; subtitle: string } {
  const { cleaningDays, weekBookings, weekExpenses, rates } = params;
  // How many weeks the caller's booking/expense window actually spans —
  // 1 for the default "this week" case. Only the Auditor's flat weekly rate
  // needs this: every other line here (day-rate × cleaning days, commission
  // × bookings, logged "Salary" expenses) already scales correctly just by
  // the caller passing a wider or narrower window, since it's counting real
  // activity within whatever range was given, not applying its own rate.
  const periodWeeks = params.periodWeeks ?? 1;
  const items: TeamLineItem[] = [];
  let subtitle = "";

  if (emp.role === "HOUSEKEEPING") {
    const regularPay = cleaningDays * rates.housekeepingDayRate;
    if (cleaningDays > 0) {
      items.push({ label: "Regular pay", detail: `₱${rates.housekeepingDayRate}/day × ${cleaningDays} day${cleaningDays !== 1 ? "s" : ""}`, amount: regularPay });
    }
    const nightCleans = weekBookings.filter((b) => b.cleanerId === emp.id && b.stayType === "Night").length;
    const bonus = nightCleans * rates.housekeepingNightBonus;
    if (nightCleans > 0) {
      items.push({ label: "Night-clean bonus", detail: `₱${rates.housekeepingNightBonus} × ${nightCleans} unit${nightCleans !== 1 ? "s" : ""}`, amount: bonus });
    }
    subtitle = `₱${rates.housekeepingDayRate}/day + ₱${rates.housekeepingNightBonus} per night clean`;
  } else if (emp.role === "BOOKER") {
    const bookingsLogged = weekBookings.filter((b) => b.bookerId === emp.id).length;
    const commission = bookingsLogged * rates.bookerCommission;
    if (bookingsLogged > 0) {
      items.push({ label: "Booking commission", detail: `₱${rates.bookerCommission} × ${bookingsLogged} booking${bookingsLogged !== 1 ? "s" : ""}`, amount: commission });
    }
    subtitle = `₱${rates.bookerCommission}/booking + weekly salary + boost fees`;
  } else if (emp.role === "AUDITOR") {
    const auditorAmount = Math.round(rates.auditorWeeklyRate * periodWeeks);
    if (auditorAmount > 0) {
      items.push({
        label: "Weekly rate",
        detail: periodWeeks === 1 ? "flat rate" : `₱${rates.auditorWeeklyRate}/week × ${periodWeeks.toFixed(1)} wk`,
        amount: auditorAmount,
      });
    }
    subtitle = `₱${rates.auditorWeeklyRate}/week`;
  }

  // Manual weekly expenses charged to this employee: the flat recurring
  // "Salary" adds to what they're owed; everything else logged against them
  // (ad boosts, etc.) is deducted from it.
  const empExpenses = weekExpenses.filter((e) => e.targetEmployeeId === emp.id);
  const salary = empExpenses.filter((e) => e.note === "Salary").reduce((s, e) => s + e.amount, 0);
  if (salary > 0) items.push({ label: "Weekly salary", detail: "flat rate", amount: salary });
  empExpenses.filter((e) => e.note !== "Salary").forEach((e) => items.push({ label: e.note, detail: "deducted this week", amount: e.amount, deduction: true }));

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
  employees: { id: string; monthlySalary: number; active?: boolean }[],
  history: SalaryHistoryEntry[],
  period: DashboardPeriodType,
  periodStart: Date,
  days?: number
): number {
  return employees
    .filter((e) => e.active !== false)
    .reduce((sum, e) => sum + salaryForPeriod(effectiveMonthlySalary(e.id, e.monthlySalary, history, periodStart), period, days), 0);
}
