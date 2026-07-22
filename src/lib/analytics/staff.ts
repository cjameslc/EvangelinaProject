import { computeTeamBreakdown, isPayrollRole, type PayrollRates } from "@/lib/payroll";

export type StaffBooking = {
  bookerId: string | null;
  cleanerId: string | null;
  unitId: string;
  stayType: string;
  date: string;
  checkOutDate: string | null;
  checkOutTime: string | null;
  paid: boolean;
  cancelledAt: string | null;
  dpAmount: number | null;
  refundedAt: string | null;
};
export type StaffCleaningLog = { employeeId: string | null; startedAt: string };
export type StaffExpense = { note: string; amount: number; targetEmployeeId: string | null };

export type StaffPerformanceRow = {
  employeeId: string;
  name: string;
  role: string;
  bookingsLogged: number;
  cleaningsCompleted: number;
  commissionEarnedCentavos: number;
  totalEarnedCentavos: number;
  activitiesPerDay: number;
  subtitle: string;
};

const manilaDay = (d: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

/**
 * Per-staff activity + earnings for the selected period — reuses
 * computeTeamBreakdown from @/lib/payroll (the exact same commission/
 * day-rate/bonus formula Dashboard's "Your team" and Earnings' Owner
 * Summary already use), rather than re-deriving payroll math a third
 * time. Same booking array is passed to every employee's call —
 * computeTeamBreakdown does its own internal bookerId/cleanerId filtering,
 * so there's no need to pre-slice per employee here.
 *
 * "Productivity" is reported as a plain activity rate (bookings + cleans
 * completed per day of the period), not a blended 0-100 "score" — a
 * weighted score would need an arbitrary weighting between booking and
 * cleaning activity this app has no stated policy for, and inventing one
 * would be exactly the kind of fabricated number this module avoids
 * everywhere else.
 */
export function staffPerformance(
  employees: { id: string; name: string; role: string; active?: boolean }[],
  bookings: StaffBooking[],
  cleaningLogs: StaffCleaningLog[],
  expenses: StaffExpense[],
  rates: PayrollRates,
  periodWeeks: number,
  periodDays: number
): StaffPerformanceRow[] {
  return employees
    .filter((e) => e.active !== false && isPayrollRole(e.role))
    .map((emp) => {
      const cleaningDays = new Set(cleaningLogs.filter((c) => c.employeeId === emp.id).map((c) => manilaDay(c.startedAt))).size;
      const breakdown = computeTeamBreakdown(emp, { cleaningDays, weekBookings: bookings, weekExpenses: expenses, rates, periodWeeks });
      const bookingsLogged = bookings.filter((b) => b.bookerId === emp.id).length;
      const cleaningsCompleted = bookings.filter((b) => b.cleanerId === emp.id).length;
      const commissionItem = breakdown.items.find((i) => i.label === "Booking commission");
      return {
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        bookingsLogged,
        cleaningsCompleted,
        commissionEarnedCentavos: (commissionItem?.amount ?? 0) * 100,
        totalEarnedCentavos: breakdown.total * 100,
        activitiesPerDay: periodDays > 0 ? Math.round(((bookingsLogged + cleaningsCompleted) / periodDays) * 10) / 10 : 0,
        subtitle: breakdown.subtitle,
      };
    })
    .sort((a, b) => b.totalEarnedCentavos - a.totalEarnedCentavos);
}
