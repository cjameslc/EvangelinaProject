"use client";

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { ArrowLeftIcon, ArrowRightIcon, EditIcon, TrashIcon } from "@/components/ui/Icons";
import { peso, fmtDate } from "@/lib/format";
import { PLATFORMS, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";

type Person = { name: string; role: string };
type Unit = { id: string; name: string; shortName: string; unitNumber: string; owners?: { user: { name: string } }[] };
type Booking = {
  id: string; date: string; unit: Unit; guests: string[]; pax: number | null; platform: string;
  amount: number; paid: boolean; method: string | null;
  dpAmount: number | null; dpMethod: string | null;
  booker: Person | null; receivedBy: Person | null; dpReceivedBy: Person | null;
};
type Employee = { id: string; name: string; role: string };
type Expense = { id: string; date: string; amount: number; note: string; targetEmployee: Employee | null };

const METHOD_COLOR: Record<string, string> = { Cash: "var(--ink)", GCash: "var(--green)", BankTransfer: "var(--blue)" };

// Business runs in Manila (UTC+8) — always bucket "today"/week boundaries by
// the Manila calendar date, not the server or browser's own timezone.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function weekRange(offset: number) {
  const todayIso = dayOf(new Date());
  const start = new Date(todayIso);
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function guestCount(b: Booking) {
  return b.pax ?? b.guests.length ?? 0;
}

function methodBreakdown(bookings: Booking[]) {
  const totals: Record<string, number> = { Cash: 0, GCash: 0, BankTransfer: 0 };
  bookings.forEach((b) => {
    if (b.dpMethod) totals[b.dpMethod] = (totals[b.dpMethod] ?? 0) + (b.dpAmount ?? 0);
    if (b.paid && b.method) totals[b.method] = (totals[b.method] ?? 0) + b.amount;
  });
  return totals;
}

export function WeeklyReport({
  bookings, units, employees, initialExpenses, canEditExpenses,
}: {
  bookings: Booking[];
  units: Unit[];
  employees: Employee[];
  initialExpenses: Expense[];
  canEditExpenses: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [expenses, setExpenses] = useState(initialExpenses);
  const { start, end } = useMemo(() => weekRange(offset), [offset]);
  const weekLabel = `${fmtDate(start, { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })} to ${fmtDate(new Date(end.getTime() - 86400000), { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}`;

  const weekBookings = useMemo(() => {
    return bookings.filter((b) => {
      const d = new Date(dayOf(new Date(b.date)));
      return d >= start && d < end;
    });
  }, [bookings, start, end]);

  const weekExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = new Date(dayOf(new Date(e.date)));
      return d >= start && d < end;
    });
  }, [expenses, start, end]);

  const totalGuests = weekBookings.reduce((s, b) => s + guestCount(b), 0);
  const totalRevenue = weekBookings.reduce((s, b) => s + (b.paid ? b.amount : 0) + (b.dpAmount ?? 0), 0);
  const totalUnpaid = weekBookings.filter((b) => !b.paid).reduce((s, b) => s + b.amount, 0);
  const totalExpenses = weekExpenses.reduce((s, e) => s + e.amount, 0);
  const adjustedTotal = totalRevenue - totalExpenses;

  const byOwner = useMemo(() => {
    const groups = new Map<string, Unit[]>();
    units.forEach((u) => {
      const owner = u.owners?.length ? u.owners.map((o) => o.user.name).join(" & ") : "Owner/Admin";
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner)!.push(u);
    });
    return [...groups.entries()].map(([owner, ownerUnits]) => ({
      owner,
      units: ownerUnits.map((u) => {
        const ub = weekBookings.filter((b) => b.unit.id === u.id);
        return {
          unit: u,
          bookings: ub.length,
          guests: ub.reduce((s, b) => s + guestCount(b), 0),
          revenue: ub.reduce((s, b) => s + (b.paid ? b.amount : 0) + (b.dpAmount ?? 0), 0),
        };
      }),
    }));
  }, [units, weekBookings]);

  const byPlatform = useMemo(() => {
    return PLATFORMS.map((p) => {
      const pb = weekBookings.filter((b) => b.platform === p);
      return { platform: p, bookings: pb.length, methodTotals: methodBreakdown(pb) };
    });
  }, [weekBookings]);

  const byMethod = useMemo(() => {
    const totals = methodBreakdown(weekBookings);
    return PAYMENT_METHODS.map((m) => ({ method: m, total: totals[m] ?? 0 }));
  }, [weekBookings]);

  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; role: string; collected: number; expenses: number; bookingsLogged: number }>();
    const get = (p: Person) => {
      const row = map.get(p.name) ?? { name: p.name, role: p.role, collected: 0, expenses: 0, bookingsLogged: 0 };
      map.set(p.name, row);
      return row;
    };
    weekBookings.forEach((b) => {
      if (b.receivedBy && b.paid) get(b.receivedBy).collected += b.amount;
      if (b.dpReceivedBy && b.dpAmount) get(b.dpReceivedBy).collected += b.dpAmount;
      if (b.booker) get(b.booker).bookingsLogged += 1;
    });
    weekExpenses.forEach((e) => {
      if (e.targetEmployee) get(e.targetEmployee).expenses += e.amount;
    });
    return [...map.values()].sort((a, b) => (b.collected - b.expenses) - (a.collected - a.expenses));
  }, [weekBookings, weekExpenses]);

  async function refreshExpenses() {
    const res = await fetch("/api/weekly-expenses");
    if (res.ok) setExpenses(await res.json());
  }

  // Fetch fresh on mount (not just rely on server-rendered initialExpenses) so
  // this week's standing recurring salaries get auto-logged the first time
  // anyone opens the report, without needing an edit action to trigger it.
  useEffect(() => {
    refreshExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unitLabel = `${units.length} unit${units.length !== 1 ? "s" : ""} (${units.map((u) => u.unitNumber).join(", ")})`;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-[15px] font-extrabold leading-tight">{unitLabel}</h2>
          <p className="text-[12px] text-[var(--gray)]">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setOffset((o) => o - 1)} className="btn-icon !h-9 !w-9" aria-label="Previous week"><ArrowLeftIcon className="h-4 w-4" /></button>
          {offset !== 0 && <button onClick={() => setOffset(0)} className="btn btn-sm">This week</button>}
          <button onClick={() => setOffset((o) => o + 1)} className="btn-icon !h-9 !w-9" aria-label="Next week"><ArrowRightIcon className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Bookings" value={weekBookings.length} sub="Sun–Sat" />
        <StatCard label="Guests" value={totalGuests} />
        <StatCard label="Total paid" value={peso(totalRevenue)} />
        <StatCard label="Unpaid" value={peso(totalUnpaid)} warn={totalUnpaid > 0} />
        <StatCard label="Adjusted paid" value={peso(adjustedTotal)} sub={totalExpenses > 0 ? `− ${peso(totalExpenses)} expenses` : "no expenses"} warn={totalExpenses > 0} />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-[15px] font-extrabold">Guests by platform</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {byPlatform.map((p) => (
            <div key={p.platform} className="rounded-xl border border-[var(--line)] p-3.5">
              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{p.platform}</div>
              <div className="mt-0.5 text-[22px] font-extrabold leading-tight">{p.bookings}</div>
              <div className="mt-2 space-y-0.5 text-[11.5px] font-semibold">
                {PAYMENT_METHODS.map((m) => (
                  <div key={m} className="flex items-center justify-between">
                    <span className="text-[var(--gray)]">{PAYMENT_METHOD_LABEL[m]}</span>
                    <span style={{ color: METHOD_COLOR[m] }}>{peso(p.methodTotals[m] ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {byMethod.map((m) => (
          <div key={m.method} className="stat-card">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{PAYMENT_METHOD_LABEL[m.method as keyof typeof PAYMENT_METHOD_LABEL] ?? m.method}</div>
            <div className="mt-1 text-[19px] font-extrabold" style={{ color: METHOD_COLOR[m.method] }}>{peso(m.total)}</div>
          </div>
        ))}
        <div className="stat-card border-violet/30 bg-violet/5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-violet">Total paid</div>
          <div className="mt-1 text-[19px] font-extrabold text-violet">{peso(totalRevenue)}</div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-[15px] font-extrabold">Units by owner</h2>
        <p className="mb-3 text-[12.5px] text-[var(--gray)]">Only the units each owner actually has, with this week&rsquo;s activity.</p>
        <div className="space-y-4">
          {byOwner.map(({ owner, units: ownerUnits }) => (
            <div key={owner}>
              <h3 className="mb-1.5 text-[13px] font-extrabold text-rausch">{owner}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ownerUnits.map(({ unit, bookings: bk, guests, revenue }) => (
                  <div key={unit.id} className="rounded-xl border border-[var(--line)] p-3">
                    <div className="text-[13px] font-extrabold">Unit {unit.unitNumber} · {unit.shortName}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[var(--gray)]">
                      <span><b className="font-bold text-[var(--ink)]">{bk}</b> bookings</span>
                      <span><b className="font-bold text-[var(--ink)]">{guests}</b> guests</span>
                      <span><b className="font-bold text-green">{peso(revenue)}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <WeeklyExpensesCard
        weekExpenses={weekExpenses}
        weekLabel={weekLabel}
        totalExpenses={totalExpenses}
        adjustedTotal={adjustedTotal}
        employees={employees}
        canEdit={canEditExpenses}
        defaultDate={(() => { const now = new Date(); return now >= start && now < end ? dayOf(now) : dayOf(start); })()}
        onChanged={refreshExpenses}
      />

      <div className="card p-5">
        <h2 className="mb-1 text-[15px] font-extrabold">Who collected the money</h2>
        <p className="mb-3 text-[12.5px] text-[var(--gray)]">Everyone involved this week — bookers, housekeeping, owners — collected minus any expenses charged to them.</p>
        {byPerson.length === 0 ? (
          <p className="text-[13px] text-[var(--gray)]">No activity this week.</p>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {byPerson.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div>
                  <div className="text-[13.5px] font-bold">{p.name}</div>
                  <div className="text-[11.5px] text-[var(--gray)]">
                    {p.role.replace("_", " ")}
                    {p.bookingsLogged > 0 ? ` · logged ${p.bookingsLogged} booking${p.bookingsLogged !== 1 ? "s" : ""}` : ""}
                    {p.expenses > 0 ? ` · ${peso(p.collected)} − ${peso(p.expenses)} expenses` : ""}
                  </div>
                </div>
                <div className={`text-[14px] font-extrabold ${p.collected - p.expenses < 0 ? "text-rausch" : "text-green"}`}>{peso(p.collected - p.expenses)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_FORM = { id: null as string | null, amount: "", note: "", targetEmployeeId: "", date: "" };

function WeeklyExpensesCard({
  weekExpenses, weekLabel, totalExpenses, adjustedTotal, employees, canEdit, defaultDate, onChanged,
}: {
  weekExpenses: Expense[];
  weekLabel: string;
  totalExpenses: number;
  adjustedTotal: number;
  employees: Employee[];
  canEdit: boolean;
  defaultDate: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY_FORM, date: defaultDate });
  const [saving, setSaving] = useState(false);
  const editing = form.id !== null;

  function startEdit(e: Expense) {
    setForm({ id: e.id, amount: String(e.amount), note: e.note, targetEmployeeId: e.targetEmployee?.id ?? "", date: e.date.slice(0, 10) });
  }
  function cancelEdit() {
    setForm({ ...EMPTY_FORM, date: defaultDate });
  }

  async function submit() {
    const amountNum = Number(form.amount);
    if (!amountNum || amountNum <= 0) { toast("Enter an amount", true); return; }
    if (!form.note.trim()) { toast("Add a short comment for this expense", true); return; }
    setSaving(true);
    const payload = { date: form.date, amount: amountNum, note: form.note, targetEmployeeId: form.targetEmployeeId || null };
    const res = await fetch(editing ? `/api/weekly-expenses/${form.id}` : "/api/weekly-expenses", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast(j.error ?? "Couldn't save expense", true); return; }
    toast(editing ? "Expense updated ✓" : "Expense added ✓");
    cancelEdit();
    onChanged();
  }

  async function remove(id: string) {
    if (!confirm("Remove this expense?")) return;
    const res = await fetch(`/api/weekly-expenses/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't remove expense", true); return; }
    toast("Expense removed");
    if (form.id === id) cancelEdit();
    onChanged();
  }

  return (
    <div className="card border-amber/30 bg-amber/5 p-5">
      <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-amber">Manual weekly expenses</h2>
      <p className="mt-0.5 text-[12px] text-amber/80">Deducted for week: {weekLabel}</p>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[100px] flex-1">
            <label className="field-label">Amount</label>
            <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="field-input mt-1.5" placeholder="e.g. 100" />
          </div>
          <div className="min-w-[180px] flex-[2]">
            <label className="field-label">Comment</label>
            <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="field-input mt-1.5" placeholder="e.g. Facebook ads boost" />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="field-label">Charge to</label>
            <select value={form.targetEmployeeId} onChange={(e) => setForm((f) => ({ ...f, targetEmployeeId: e.target.value }))} className="field-input mt-1.5">
              <option value="">General expense</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="field-label">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="field-input mt-1.5" />
          </div>
          <button onClick={submit} disabled={saving} className="btn-primary">{saving ? "Saving…" : editing ? "Save changes" : "Add expense"}</button>
          {editing && <button onClick={cancelEdit} className="btn-ghost">Cancel</button>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px] font-bold">
        <span>Manual expenses total: <span className="text-amber">{peso(totalExpenses)}</span></span>
        <span>Adjusted total paid: <span className="text-amber">{peso(adjustedTotal)}</span></span>
      </div>

      {weekExpenses.length === 0 ? (
        <p className="mt-4 text-[13px] text-amber/80">No expenses logged this week.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-amber/20 bg-[var(--card)]">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-amber">
                {["Date", "Charged to", "Comment", "Amount", canEdit ? "Action" : ""].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-amber/20 px-3.5 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekExpenses.map((e) => (
                <tr key={e.id} className="border-b border-amber/10 last:border-0">
                  <td className="whitespace-nowrap px-3.5 py-2.5 font-bold">{fmtDate(e.date, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}</td>
                  <td className="px-3.5 py-2.5">{e.targetEmployee?.name ?? "General"}</td>
                  <td className="px-3.5 py-2.5">
                    {e.note}
                    {e.note === "Salary" && (
                      <span className="ml-1.5 rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber">Recurring</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 font-extrabold text-rausch">−{peso(e.amount)}</td>
                  {canEdit && (
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(e)} className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"><EditIcon className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(e.id)} className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
