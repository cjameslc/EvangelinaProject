"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Accordion } from "@/components/ui/Accordion";
import { Pill } from "@/components/ui/Pill";
import { peso, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, ArrowLeftIcon, FilterIcon, FileSpreadsheetIcon, FilePdfIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { useMonthlyReportExport } from "../hooks/useMonthlyReportExport";
import type { Unit, Booking, Employee, Bill, RangeType, StatusFilter } from "../types";
import type { OccupancyBlock } from "@/lib/analytics/occupancy";

export function EarningsSection({
  // Full period-filter bundle (with setters) — this card is the one place
  // that actually mutates the selected period.
  rangeType, setRangeType,
  periodOffset, setPeriodOffset,
  customRange, setCustomRange,
  selectedDate, setSelectedDate,
  statusFilter, setStatusFilter,
  resetFilters,
  periodLabel,
  periodBookings,
  periodIncome,
  historicalIncome,
  displayedPeriodIncome,
  previousPeriodIncome,
  periodTrendPct,
  earningsBuckets,
  avgStayNights,
  platformBreakdown,
  periodSalary,
  periodStartIso,
  periodEndIso,
  // Monthly report export inputs (threaded through to useMonthlyReportExport).
  units,
  bookingsMonth,
  employees,
  monthRangeStart,
  monthRangeEnd,
  calendarBlocksOccupancy,
  unitStatus,
  todayIso,
  monthIncome,
  expectedMonthIncome,
  billsPaidMonthCentavos,
  billsDueMonthCentavos,
  overdueCentavos,
  accruedStaffSalary,
  upcomingStaffSalary,
  netProfit,
  forecastProfit,
  margin,
  cashFlow,
  dueBills,
  billMeta,
}: {
  rangeType: RangeType;
  setRangeType: (v: RangeType) => void;
  periodOffset: number;
  setPeriodOffset: (value: number | ((o: number) => number)) => void;
  customRange: { start: string; end: string };
  setCustomRange: (fn: (c: { start: string; end: string }) => { start: string; end: string }) => void;
  selectedDate: string | null;
  setSelectedDate: (v: string | null) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  resetFilters: () => void;
  periodLabel: string;
  periodBookings: Booking[];
  periodIncome: number;
  historicalIncome: number | undefined;
  displayedPeriodIncome: number;
  previousPeriodIncome: number;
  periodTrendPct: number;
  earningsBuckets: { label: string; dateLabel: string; amount: number; count: number }[];
  avgStayNights: number;
  platformBreakdown: { platform: string; label: string; bookings: number; nights: number; revenue: number }[];
  periodSalary: number;
  periodStartIso: string;
  periodEndIso: string;
  units: Unit[];
  bookingsMonth: Booking[];
  employees: Employee[];
  monthRangeStart: string;
  monthRangeEnd: string;
  calendarBlocksOccupancy: OccupancyBlock[];
  unitStatus: (unit: Unit) => { label: string; dot: string };
  todayIso: string;
  monthIncome: number;
  expectedMonthIncome: number;
  billsPaidMonthCentavos: number;
  billsDueMonthCentavos: number;
  overdueCentavos: number;
  accruedStaffSalary: number;
  upcomingStaffSalary: number;
  netProfit: number;
  forecastProfit: number;
  margin: number;
  cashFlow: number;
  dueBills: Bill[];
  billMeta: (b: Bill) => { icon: string; label: string; sub: string };
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [earningsCollapsed, setEarningsCollapsed] = useState(false);
  const [periodNavOpen, setPeriodNavOpen] = useState(false);
  const { data: session } = useSession();
  const businessName = session?.user?.ownerBusinessName || "Evangelina's Staycation";

  const { exportExcel, exportPDF } = useMonthlyReportExport({
    businessName,
    units,
    bookingsMonth,
    employees,
    monthRangeStart,
    monthRangeEnd,
    calendarBlocksOccupancy,
    unitStatus,
    todayIso,
    monthIncome,
    expectedMonthIncome,
    billsPaidMonthCentavos,
    billsDueMonthCentavos,
    overdueCentavos,
    accruedStaffSalary,
    upcomingStaffSalary,
    netProfit,
    forecastProfit,
    margin,
    cashFlow,
    dueBills,
    billMeta,
  });

  return (
    <Accordion title="Earnings" sub={periodLabel}>
      {/* Collapsed by default — the accordion header above already shows
          periodLabel, so a big always-visible nav bar repeating it was
          pure redundancy that ate space on mobile. Icon-only (not
          repeating the label a second time here) — tap to reveal the
          period nav + Filters when you actually need them. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setPeriodNavOpen((v) => !v)}
          aria-label="Change period"
          aria-expanded={periodNavOpen}
          title="Change period"
          className={cn("btn-icon !h-8 !w-8", periodNavOpen && "border-[var(--ink)]")}
        >
          <FilterIcon className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportExcel} className="btn-icon !h-9 !w-9" aria-label="Excel report" title="Download this month's report as a spreadsheet">
            <FileSpreadsheetIcon className="h-4 w-4" />
          </button>
          <button onClick={exportPDF} className="btn-icon !h-9 !w-9" aria-label="PDF report" title="Download this month's report as a PDF">
            <FilePdfIcon className="h-4 w-4" />
          </button>
          <button onClick={() => setEarningsCollapsed((v) => !v)} className="btn-icon !h-9 !w-9" aria-label={earningsCollapsed ? "Expand" : "Collapse"} title={earningsCollapsed ? "Expand" : "Collapse"}>
            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", earningsCollapsed && "-rotate-90")} />
          </button>
        </div>
      </div>

      {periodNavOpen && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {rangeType !== "custom" && (
            <button onClick={() => setPeriodOffset((o) => o - 1)} className="btn-icon !h-9 !w-9" aria-label="Previous period"><ArrowLeftIcon className="h-4 w-4" /></button>
          )}
          <span className="min-w-[150px] text-center text-[14.5px] font-extrabold">{periodLabel}</span>
          {rangeType !== "custom" && (
            <button onClick={() => setPeriodOffset((o) => o + 1)} className="btn-icon !h-9 !w-9" aria-label="Next period"><ArrowRightIcon className="h-4 w-4" /></button>
          )}
          <button onClick={() => setFiltersOpen((v) => !v)} className={cn("btn btn-sm", filtersOpen && "border-[var(--ink)]")}>
            <FilterIcon className="h-3.5 w-3.5" /> Filters
          </button>
        </div>
      )}

      {!earningsCollapsed && (
        <>
          {filtersOpen && (
            <div className="mb-4 rounded-2xl border border-[var(--line)] p-4">
              <div className="mb-3.5">
                <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Time range</div>
                <div className="inline-flex flex-wrap gap-1 rounded-full bg-[var(--bg-2)] p-1">
                  {(["daily", "weekly", "monthly", "yearly", "custom"] as const).map((rt) => (
                    <button
                      key={rt}
                      onClick={() => { setRangeType(rt); setPeriodOffset(0); setSelectedDate(null); }}
                      className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold capitalize transition", rangeType === rt ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
                    >
                      {rt === "daily" ? "Today" : rt}
                    </button>
                  ))}
                </div>
                {rangeType === "custom" && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={customRange.start}
                      max={customRange.end || undefined}
                      onChange={(e) => setCustomRange((c) => ({ ...c, start: e.target.value }))}
                      className="field-input w-auto"
                    />
                    <span className="text-[13px] text-[var(--gray)]">to</span>
                    <input
                      type="date"
                      value={customRange.end}
                      min={customRange.start || undefined}
                      onChange={(e) => setCustomRange((c) => ({ ...c, end: e.target.value }))}
                      className="field-input w-auto"
                    />
                  </div>
                )}
              </div>

              <div className="mb-3.5">
                <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Filter by date</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={selectedDate ?? ""}
                    min={periodStartIso}
                    max={periodEndIso}
                    onChange={(e) => setSelectedDate(e.target.value || null)}
                    className="field-input w-auto"
                  />
                  {selectedDate && (
                    <button onClick={() => setSelectedDate(null)} className="text-[13px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Clear</button>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Status</div>
                <div className="flex flex-wrap gap-2">
                  <Pill on={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</Pill>
                  <Pill on={statusFilter === "occupied"} onClick={() => setStatusFilter("occupied")}>Occupied</Pill>
                  <Pill on={statusFilter === "reserved"} onClick={() => setStatusFilter("reserved")}>Reserved</Pill>
                  <Pill on={statusFilter === "cleaning"} onClick={() => setStatusFilter("cleaning")}>Cleaning</Pill>
                  <Pill on={statusFilter === "available"} onClick={() => setStatusFilter("available")}>Available</Pill>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3.5">
                <button onClick={resetFilters} className="text-[13px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Reset filters</button>
                <button onClick={() => setFiltersOpen(false)} className="btn-primary btn-sm">Done</button>
              </div>
            </div>
          )}

          <p className="text-[13px] text-[var(--gray)]">
            You&rsquo;ve earned {rangeType === "daily" ? "today" : rangeType === "weekly" ? "this week" : rangeType === "monthly" ? "this month" : rangeType === "custom" ? "in this range" : "this year"}
          </p>
          <div className="mt-1 text-[38px] font-extrabold tracking-tight">{peso(displayedPeriodIncome)}</div>
          {historicalIncome !== undefined && (
            <p className="mt-1 text-[12px] font-semibold text-[var(--gray)]">Historical record from Airbnb&rsquo;s official report — no day-by-day detail tracked for this month.</p>
          )}
          {historicalIncome === undefined && previousPeriodIncome > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-[13px]">
              <span className={cn("inline-flex items-center gap-0.5 font-bold", periodTrendPct >= 0 ? "text-green" : "text-amber")}>
                {periodTrendPct >= 0 ? "▲" : "▼"} {Math.abs(periodTrendPct)}%
              </span>
              <span className="text-[var(--gray)]">vs previous {rangeType === "daily" ? "day" : rangeType === "weekly" ? "week" : rangeType === "monthly" ? "month" : rangeType === "custom" ? "period" : "year"}</span>
            </div>
          )}
          {/* Real, not statistical — the full contracted value of every
              non-cancelled booking already on the calendar this month
              (elapsed + upcoming, paid or not), same expectedMonthIncome
              Forecast Profit is measured against. Only meaningful next to
              "this month" specifically — displayedPeriodIncome for
              daily/weekly/yearly/custom covers a different window than
              expectedMonthIncome always does. */}
          {rangeType === "monthly" && expectedMonthIncome > displayedPeriodIncome && (
            <p className="mt-2 text-[13px] text-[var(--gray)]">
              <span className="font-bold text-[var(--ink)]">+{peso(expectedMonthIncome - displayedPeriodIncome)}</span> still to come from bookings already on the calendar this month → projected <span className="font-bold text-[var(--ink)]">{peso(expectedMonthIncome)}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--gray)]">
            <span><b className="text-[var(--ink)]">{periodBookings.length}</b> booked nights</span>
            <span><b className="text-[var(--ink)]">{periodBookings.length}</b> reservations</span>
            {periodBookings.length > 0 && <span>Avg. stay <b className="text-[var(--ink)]">{avgStayNights.toFixed(1)} nights</b></span>}
            {(selectedDate || statusFilter !== "all") && (
              <span className="text-violet">filtered{selectedDate ? ` · ${fmtDate(selectedDate, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}` : ""}{statusFilter !== "all" ? ` · ${statusFilter}` : ""}</span>
            )}
          </div>

          {earningsBuckets.length > 1 && (
            <div className="mt-4 flex h-[130px] items-end gap-2 sm:gap-3">
              {(() => {
                const max = Math.max(1, ...earningsBuckets.map((b) => b.amount));
                return earningsBuckets.map((b, i) => (
                  <div key={i} className="group relative flex flex-1 flex-col items-center gap-1.5">
                    <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1c1c1e] px-2.5 py-1.5 text-center opacity-0 shadow-card transition-opacity group-hover:opacity-100">
                      <div className="text-[11px] font-extrabold text-white">{peso(b.amount)}</div>
                      <div className="text-[10px] font-semibold text-white/70">{b.dateLabel} · {b.count} booking{b.count === 1 ? "" : "s"}</div>
                    </div>
                    <div
                      className={cn("w-full max-w-[36px] rounded-t-md transition-all group-hover:brightness-110", b.amount > 0 ? "dash-gradient-bar" : "bg-[var(--bg-2)]")}
                      style={{ height: `${Math.max(4, Math.round((b.amount / max) * 80))}px` }}
                    />
                    <span className="text-[10.5px] font-semibold text-[var(--gray)]">{b.label}</span>
                  </div>
                ));
              })()}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-[var(--line)] p-4">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Computation</div>
            <div className="mt-2 space-y-1.5 text-[13.5px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--gray)]">Paid</span>
                <span className="font-bold text-green">{peso(displayedPeriodIncome)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--gray)]">Salary</span>
                <span className="font-bold text-amber">−{peso(periodSalary)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--line)] pt-1.5 text-[14.5px]">
                <span className="font-extrabold">Total earned</span>
                <span className={cn("font-extrabold", displayedPeriodIncome - periodSalary < 0 && "text-amber")}>{peso(displayedPeriodIncome - periodSalary)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--line)] p-4">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Revenue by platform</div>
            {platformBreakdown.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--gray)]">No bookings in this range.</p>
            ) : (
              <div className="mt-2.5 space-y-2">
                {platformBreakdown.map((p) => {
                  const pct = periodIncome > 0 ? Math.round((p.revenue / periodIncome) * 100) : 0;
                  return (
                    <div key={p.platform} className="flex items-center gap-3 text-[13px]">
                      <span className="w-[100px] flex-none truncate font-bold" title={p.label}>{p.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
                        <div className="dash-gradient-bar-h h-full rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-[70px] flex-none text-right text-[11.5px] text-[var(--gray)]">{p.bookings} bkg · {p.nights}n</span>
                      <span className="w-[85px] flex-none text-right font-bold">{peso(p.revenue)}</span>
                      <span className="w-[38px] flex-none text-right text-[11.5px] text-[var(--gray)]">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Accordion>
  );
}
