"use client";

import { useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "@/components/ui/Icons";
import { ROLE_LABEL } from "@/lib/constants";
import { peso, manilaWeekRange } from "@/lib/format";
import { monthlySalaryFromRate, weeklySalaryFor, computeTeamBreakdown, isPayrollRole, type PayrollRates, type SalaryType } from "@/lib/payroll";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string; role: string; monthlySalary: number; salaryType?: SalaryType; salaryRate?: number };
type Person = { id: string } | null;
type WeekBooking = { date: string; checkOutDate: string | null; checkOutTime: string | null; unitId: string; stayType: string; paid: boolean; booker: Person; cleaner: Person };
type WeekExpense = { date: string; amount: number; note: string; targetEmployee: { id: string } | null };
type CleaningLogRow = { employeeId: string | null; startedAt: string };

const SALARY_TYPE_LABEL: Record<SalaryType, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };
const RATE_LABEL: Record<SalaryType, string> = { DAILY: "Rate per day (₱)", WEEKLY: "Rate per week (₱)", MONTHLY: "Rate per month (₱)" };

export function StaffTab({
  employees, onChanged, weekBookings = [], weekExpenses = [], cleaningLogs = [], payrollRates,
}: {
  employees: Employee[];
  onChanged: () => void;
  weekBookings?: WeekBooking[];
  weekExpenses?: WeekExpense[];
  cleaningLogs?: CleaningLogRow[];
  payrollRates?: PayrollRates;
}) {
  const toast = useToast();

  // "Earned this week" — the same commission/day-rate figure shown on the
  // Dashboard's "Your team" card (computeTeamBreakdown), surfaced here too so
  // admins can see actual take-home next to the flat salary they're
  // configuring, without switching pages. Distinct from "Salary this week"
  // below: this is activity-driven (bookings logged, days cleaned), not
  // derived from the rate field at all — it won't move when you edit the
  // rate, only when this week's real bookings/cleanings change.
  const thisWeekTotals = useMemo(() => {
    if (!payrollRates) return new Map<string, number>();
    const { start, end } = manilaWeekRange(0);
    const inWeek = (iso: string) => { const d = new Date(iso); return d >= start && d < end; };
    const bookingsThisWeek = weekBookings.filter((b) => inWeek(b.date));
    const expensesThisWeek = weekExpenses.filter((e) => inWeek(e.date));
    const normalizedBookings = bookingsThisWeek.map((b) => ({ bookerId: b.booker?.id ?? null, cleanerId: b.cleaner?.id ?? null, unitId: b.unitId, stayType: b.stayType, date: b.date, checkOutDate: b.checkOutDate, checkOutTime: b.checkOutTime, paid: b.paid }));
    const normalizedExpenses = expensesThisWeek.map((e) => ({ note: e.note, amount: e.amount, targetEmployeeId: e.targetEmployee?.id ?? null }));
    const cleaningDaysByEmployee = new Map<string, Set<string>>();
    cleaningLogs.forEach((c) => {
      if (!c.employeeId || !inWeek(c.startedAt)) return;
      const day = c.startedAt.slice(0, 10);
      if (!cleaningDaysByEmployee.has(c.employeeId)) cleaningDaysByEmployee.set(c.employeeId, new Set());
      cleaningDaysByEmployee.get(c.employeeId)!.add(day);
    });
    const totals = new Map<string, number>();
    employees.filter((e) => isPayrollRole(e.role)).forEach((e) => {
      const { total } = computeTeamBreakdown(e, {
        cleaningDays: cleaningDaysByEmployee.get(e.id)?.size ?? 0,
        weekBookings: normalizedBookings,
        weekExpenses: normalizedExpenses,
        rates: payrollRates,
      });
      totals.set(e.id, total);
    });
    return totals;
  }, [employees, weekBookings, weekExpenses, cleaningLogs, payrollRates]);

  const [rows, setRows] = useState<{ id?: string; name: string; role: string; salaryType: SalaryType; salaryRate: string }[]>(
    employees.length
      ? employees.map((e) => ({ id: e.id, name: e.name, role: e.role, salaryType: e.salaryType ?? "MONTHLY", salaryRate: String(e.salaryRate ?? e.monthlySalary ?? 0) }))
      : [{ name: "", role: "BOOKER", salaryType: "MONTHLY", salaryRate: "" }]
  );
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<{ name: string; role: string; salaryType: SalaryType; salaryRate: string }>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function save() {
    for (const row of rows) {
      if (!row.name.trim()) continue;
      const raw = row.salaryRate.trim();
      // New hires must be given a rate up front. Existing staff who haven't
      // had one set yet (₱0, from before this field existed) can stay that
      // way until edited — one unrelated row missing a rate shouldn't block
      // saving everyone else.
      if (!row.id && (!raw || Number.isNaN(Number(raw)) || Number(raw) <= 0)) {
        toast(`Enter a valid salary rate for ${row.name}`, true);
        return;
      }
      if (raw && (Number.isNaN(Number(raw)) || Number(raw) < 0)) {
        toast(`Enter a valid salary rate for ${row.name}`, true);
        return;
      }
    }
    setSaving(true);
    try {
      for (const row of rows) {
        if (!row.name.trim()) continue;
        const payload = { name: row.name, role: row.role, salaryType: row.salaryType, salaryRate: Number(row.salaryRate) };
        if (row.id) {
          await fetch(`/api/employees/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        } else {
          await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        }
      }
      toast("Staff saved ✓");
      onChanged();
    } catch {
      toast("Couldn't save staff", true);
    } finally {
      setSaving(false);
    }
  }

  async function remove(i: number) {
    const row = rows[i];
    if (row.id) await fetch(`/api/employees/${row.id}`, { method: "DELETE" });
    setRows((r) => r.filter((_, idx) => idx !== i));
    onChanged();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13.5px] text-[var(--gray)]">These names fill the Booker, Cleaner and Received-by menus across the app. Pick whichever pay cadence matches how someone&rsquo;s actually paid — it&rsquo;s converted to a monthly-equivalent automatically for dashboard payroll.</p>
      </div>
      <div className="card space-y-3 p-5">
        {rows.map((row, i) => {
          const rateNum = Number(row.salaryRate) || 0;
          const monthlyEquiv = monthlySalaryFromRate(row.salaryType, rateNum);
          return (
            <div key={row.id ?? i} className="rounded-2xl border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <input value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Full name" className="field-input min-w-[140px] flex-1" />
                <select value={row.role} onChange={(e) => update(i, { role: e.target.value })} className="field-input flex-1 sm:w-[160px] sm:flex-none">
                  {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button onClick={() => remove(i)} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[var(--line-2)] text-[var(--gray)] hover:border-rausch hover:text-rausch">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5">
                <label className="field-label">Salary type</label>
                <div className="mt-1.5 inline-flex gap-1 rounded-full bg-[var(--bg-2)] p-1">
                  {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => update(i, { salaryType: t })}
                      className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold transition", row.salaryType === t ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
                    >
                      {SALARY_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label">{RATE_LABEL[row.salaryType]} <span className="text-rausch">*</span></label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={row.salaryRate}
                    onChange={(e) => update(i, { salaryRate: e.target.value })}
                    placeholder={row.salaryType === "DAILY" ? "e.g. 700" : row.salaryType === "WEEKLY" ? "e.g. 1000" : "e.g. 15000"}
                    className="field-input mt-1.5"
                  />
                </div>
                <div>
                  <label className="field-label">≈ Monthly equivalent</label>
                  <div className="field-input mt-1.5 flex items-center bg-[var(--bg-2)] font-bold text-[var(--gray)]" title="Derived from the rate and type — not editable">
                    {peso(monthlyEquiv)}
                  </div>
                </div>
                <div>
                  <label className="field-label">Salary this week</label>
                  <div className="field-input mt-1.5 flex items-center bg-[var(--bg-2)] font-bold text-[var(--gray)]" title="Monthly equivalent × 12 ÷ 52 — updates live as you edit the rate above">
                    {peso(weeklySalaryFor(monthlyEquiv))}
                  </div>
                </div>
              </div>
              {row.id && thisWeekTotals.has(row.id) && (
                <div className="mt-2.5">
                  <label className="field-label">Earned this week (activity)</label>
                  <div className="field-input mt-1.5 flex items-center bg-[var(--bg-2)] font-bold text-[var(--gray)]" title="Commission/day-rate actually earned from this week's real bookings and cleanings — same figure as Dashboard's Your team card">
                    {peso(thisWeekTotals.get(row.id)!)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-2">
          <button onClick={() => setRows((r) => [...r, { name: "", role: "BOOKER", salaryType: "MONTHLY", salaryRate: "" }])} className="btn-sm btn">
            <PlusIcon className="h-4 w-4" /> Add person
          </button>
          <button onClick={save} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Save staff"}</button>
        </div>
      </div>
    </div>
  );
}
