"use client";

import { useMemo, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { fmtDate, pesoCentavos, billCentavos } from "@/lib/format";
import { cn } from "@/lib/utils";
import { manilaDayKey as dayOf } from "@/lib/analytics/period";
import type { Bill } from "../types";

export function UpcomingExpensesSection({
  dueBills,
  dueDateFor,
  billMeta,
  billsPaidMonthCentavos,
  billsDueMonthCentavos,
  overdueCentavos,
  dueThisWeekBills,
  dueThisWeekCentavos,
  todayIso,
}: {
  dueBills: Bill[];
  dueDateFor: (b: Bill) => Date | null;
  billMeta: (b: Bill) => { icon: string; label: string; sub: string };
  billsPaidMonthCentavos: number;
  billsDueMonthCentavos: number;
  overdueCentavos: number;
  dueThisWeekBills: Bill[];
  dueThisWeekCentavos: number;
  todayIso: string;
}) {
  // The "Upcoming expenses" widget only ever shows bills that are actually
  // overdue — "due soon" (not yet overdue) bills are intentionally left out
  // entirely, per an explicit ask to stop surfacing those and keep this
  // list focused on what genuinely needs action now. Oldest due date first,
  // since that's the most urgent. Bills with no due date set can't be
  // judged overdue, so they're left out of this widget.
  const upcomingExpenseBills = useMemo(() => {
    const todayDate = new Date(`${todayIso}T00:00:00Z`);
    return dueBills
      .filter((b) => { const d = dueDateFor(b); return d && d < todayDate; })
      .sort((a, b) => dueDateFor(a)!.getTime() - dueDateFor(b)!.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueBills, todayIso]);

  const [expenseDateFilter, setExpenseDateFilter] = useState<string | null>(null);
  const visibleDueBills = useMemo(() => {
    if (!expenseDateFilter) return upcomingExpenseBills;
    return upcomingExpenseBills.filter((b) => {
      const d = dueDateFor(b);
      return d && dayOf(d) === expenseDateFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingExpenseBills, expenseDateFilter]);
  // The footer total must equal exactly what's listed above it — summing
  // billsDueMonthCentavos here instead would silently include pending bills
  // that aren't overdue yet (and so never appear as a row in this table),
  // making the total look wrong next to what's actually visible.
  const visibleDueBillsCentavos = useMemo(() => visibleDueBills.reduce((s, b) => s + billCentavos(b), 0), [visibleDueBills]);

  return (
    <Accordion title="Upcoming expenses" sub={expenseDateFilter ? `${fmtDate(expenseDateFilter, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} · tap to clear` : "tap a date to filter"}>
      {/* Paid vs Pending is the line that actually matters for the profit
          figures above — this app tracks a single paid/unpaid flag per
          bill (no separate Scheduled/Due/Overdue/Processing/Cancelled
          statuses), so "Pending" here covers all of those; "Overdue" is
          just the subset of Pending whose due date has already passed.
          Only "Paid this month" ever reaches Net Profit/Margin/Cash Flow. */}
      <div className="mb-3 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-green/30 bg-green/5 p-3 text-center">
          <div className="text-lg font-extrabold text-green">{pesoCentavos(billsPaidMonthCentavos)}</div>
          <div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Paid this month</div>
        </div>
        <div className="rounded-xl border border-[var(--line)] p-3 text-center">
          <div className="text-lg font-extrabold">{pesoCentavos(billsDueMonthCentavos)}</div>
          <div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Pending (not yet deducted)</div>
        </div>
        <div className="rounded-xl border border-rausch/30 bg-rausch/5 p-3 text-center">
          <div className="text-lg font-extrabold text-rausch">{pesoCentavos(overdueCentavos)}</div>
          <div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Overdue</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
        {visibleDueBills.length === 0 && (
          <p className="p-4 text-sm text-[var(--gray)]">{upcomingExpenseBills.length === 0 ? "Nothing overdue. 🎉" : "No expenses overdue on that date."}</p>
        )}
        {visibleDueBills.map((b) => {
          const meta = billMeta(b);
          const dueDate = dueDateFor(b);
          const dueIso = dueDate ? dayOf(dueDate) : null;
          const isActive = !!dueIso && expenseDateFilter === dueIso;
          return (
            <div key={b.id} className="flex items-center gap-3 border-t border-[var(--line)] p-4 first:border-0">
              {dueDate ? (
                <button
                  onClick={() => setExpenseDateFilter((v) => (v === dueIso ? null : dueIso))}
                  className={cn("grid h-12 w-12 flex-none place-items-center rounded-xl transition", isActive ? "bg-rausch text-white" : "bg-[var(--bg-2)] hover:bg-[var(--line)]")}
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span className={cn("text-[9.5px] font-extrabold uppercase tracking-wide", isActive ? "text-white/80" : "text-rausch")}>
                      {fmtDate(dueDate, { month: "short", timeZone: "Asia/Manila" })}
                    </span>
                    <span className="text-[15px] font-extrabold">{fmtDate(dueDate, { day: "numeric", timeZone: "Asia/Manila" })}</span>
                  </span>
                </button>
              ) : (
                <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[var(--bg-2)] text-lg">{meta.icon}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13.5px] font-bold">{meta.label}</span>
                  <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{b.unit?.shortName ?? "Shared"}</span>
                  <span className="rounded-full bg-rausch px-2 py-0.5 text-[10.5px] font-bold text-white">Overdue</span>
                </div>
                <div className="text-[11.5px] text-[var(--gray)]">{meta.sub}</div>
              </div>
              <div className="text-[14px] font-extrabold">{pesoCentavos(billCentavos(b))}</div>
            </div>
          );
        })}
        <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--bg-2)] p-4 text-sm font-extrabold">
          {/* Was mislabeled "Total due this week" — this list and total are
              overdue bills only (see upcomingExpenseBills' own filter
              above), never a due-this-week figure. Fixed name, same math. */}
          <span>Total overdue</span>
          <span>{pesoCentavos(visibleDueBillsCentavos)}</span>
        </div>
      </div>

      {/* A real "due this week" list — distinct from the overdue list
          above (not yet late, but close enough to plan cash flow around).
          Kept as its own block rather than merged into the overdue list so
          "Overdue" only ever means genuinely overdue, matching this
          section's own established rule. */}
      {dueThisWeekBills.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--line)]">
          <div className="border-b border-[var(--line)] bg-[var(--bg-2)] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
            Due this week
          </div>
          {dueThisWeekBills.map((b) => {
            const meta = billMeta(b);
            const dueDate = dueDateFor(b);
            return (
              <div key={b.id} className="flex items-center gap-3 border-t border-[var(--line)] p-4 first:border-0">
                {dueDate ? (
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-amber/10">
                    <span className="flex flex-col items-center leading-tight">
                      <span className="text-[9.5px] font-extrabold uppercase tracking-wide text-amber">
                        {fmtDate(dueDate, { month: "short", timeZone: "Asia/Manila" })}
                      </span>
                      <span className="text-[15px] font-extrabold">{fmtDate(dueDate, { day: "numeric", timeZone: "Asia/Manila" })}</span>
                    </span>
                  </span>
                ) : (
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[var(--bg-2)] text-lg">{meta.icon}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-bold">{meta.label}</span>
                    <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{b.unit?.shortName ?? "Shared"}</span>
                    <span className="rounded-full bg-amber px-2 py-0.5 text-[10.5px] font-bold text-white">Due soon</span>
                  </div>
                  <div className="text-[11.5px] text-[var(--gray)]">{meta.sub}</div>
                </div>
                <div className="text-[14px] font-extrabold">{pesoCentavos(billCentavos(b))}</div>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--bg-2)] p-4 text-sm font-extrabold">
            <span>Total due this week</span>
            <span>{pesoCentavos(dueThisWeekCentavos)}</span>
          </div>
        </div>
      )}
    </Accordion>
  );
}
