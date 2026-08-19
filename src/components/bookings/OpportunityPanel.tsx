"use client";

import { useMemo, useState } from "react";
import { peso, formatUnitDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/Pill";
import type { UnitOpportunity } from "@/lib/bookingEngine/opportunity";

const SCORE_STARS: Record<number, string> = { 5: "★★★★★", 4: "★★★★☆", 3: "★★★☆☆", 2: "★★☆☆☆", 1: "★☆☆☆☆" };
const SCORE_COLOR: Record<number, string> = { 5: "text-green", 4: "text-teal", 3: "text-amber", 2: "text-[var(--gray)]", 1: "text-rausch" };

type Filter = "all" | "daycation" | "night" | "both" | "high";

export function OpportunityPanel({
  opportunities, dayLabel, isToday, dailyRevenueGoal, realizedToday,
  onBook,
}: {
  opportunities: UnitOpportunity[];
  dayLabel: string;
  isToday: boolean;
  dailyRevenueGoal: number | null;
  realizedToday: number;
  onBook: (unitId: string, stayType: "Daycation" | "Night") => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(true);

  const totalPotential = opportunities.reduce((s, o) => s + o.potentialRevenue, 0);
  const totalSlots = opportunities.reduce((s, o) => s + o.slotsOpen, 0);
  const highRevenueThreshold = useMemo(() => {
    const nonZero = opportunities.map((o) => o.potentialRevenue).filter((v) => v > 0).sort((a, b) => b - a);
    return nonZero[Math.floor(nonZero.length / 2)] ?? 0; // top half counts as "high revenue"
  }, [opportunities]);

  const filtered = opportunities.filter((o) => {
    if (filter === "daycation") return o.daycation.available;
    if (filter === "night") return o.night.available;
    if (filter === "both") return o.slotsOpen === 2;
    if (filter === "high") return o.potentialRevenue >= highRevenueThreshold && o.potentialRevenue > 0;
    return true;
  });

  const lastAvailableUnit = opportunities.filter((o) => o.slotsOpen > 0).length === 1 ? opportunities.find((o) => o.slotsOpen > 0) : null;
  const fullyBookedCount = opportunities.filter((o) => o.slotsOpen === 0).length;
  const doubleBookedToday = opportunities.filter((o) => o.slotsOpen === 0).length; // both slots taken = both booked today

  const goalPct = dailyRevenueGoal ? Math.min(100, Math.round((realizedToday / dailyRevenueGoal) * 100)) : null;

  return (
    <div className="card mb-5 overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 p-5 text-left">
        <div>
          <h2 className="flex items-center gap-1.5 text-[16px] font-extrabold tracking-tight">💰 Revenue Opportunities <span className="text-[13px] font-semibold text-[var(--gray)]">{dayLabel}</span></h2>
          <p className="mt-0.5 text-[13px] text-[var(--gray)]">
            {isToday ? "Today's remaining revenue opportunity" : "Revenue opportunity"}: <span className="font-extrabold text-rausch">{peso(totalPotential)}</span> · {totalSlots} available booking slot{totalSlots !== 1 ? "s" : ""}
          </p>
        </div>
        <span className="flex-none text-[13px] font-bold text-[var(--gray)]">{expanded ? "Hide ▴" : "Show ▾"}</span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--line)] p-5 pt-4">
          {dailyRevenueGoal != null && goalPct != null && (
            <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-3.5">
              <div className="flex items-center justify-between text-[12.5px] font-bold">
                <span>{isToday ? "Today's" : dayLabel} Revenue Goal</span>
                <span>{peso(realizedToday)} / {peso(dailyRevenueGoal)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className="h-full w-full origin-left rounded-full bg-gradient-to-r from-rausch to-gold transition-transform duration-300 ease-[var(--ease-out)]"
                  style={{ transform: `scaleX(${goalPct / 100})` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--gray)]">
                <span>{goalPct}% complete</span>
                <span>Potential remaining: {peso(totalPotential)} · {totalSlots} opportunit{totalSlots !== 1 ? "ies" : "y"}</span>
              </div>
            </div>
          )}

          {(lastAvailableUnit || doubleBookedToday > 0) && (
            <div className="mb-4 space-y-1.5">
              {lastAvailableUnit && (
                <p className="text-[12.5px] font-semibold text-rausch">⚡ Last available unit for {isToday ? "today" : dayLabel}: {formatUnitDisplay(lastAvailableUnit.unitNumber, lastAvailableUnit.shortName)}</p>
              )}
              {isToday && doubleBookedToday > 0 && (
                <p className="text-[12.5px] font-semibold text-green">🏆 {doubleBookedToday} unit{doubleBookedToday !== 1 ? "s" : ""} fully optimized today (both slots booked)</p>
              )}
              {isToday && fullyBookedCount === opportunities.length && opportunities.length > 0 && (
                <p className="text-[12.5px] font-semibold text-green">⚡ Perfect occupancy day — every slot is booked!</p>
              )}
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-1.5">
            <Pill on={filter === "all"} onClick={() => setFilter("all")}>All Opportunities</Pill>
            <Pill on={filter === "daycation"} onClick={() => setFilter("daycation")}>Daycation Available</Pill>
            <Pill on={filter === "night"} onClick={() => setFilter("night")}>Night Available</Pill>
            <Pill on={filter === "both"} onClick={() => setFilter("both")}>Both Available</Pill>
            <Pill on={filter === "high"} onClick={() => setFilter("high")}>High Revenue</Pill>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-[13px] text-[var(--gray)]">
              No opportunities match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((o) => (
                <OpportunityCard key={o.unitId} o={o} onBook={onBook} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ o, onBook }: { o: UnitOpportunity; onBook: (unitId: string, stayType: "Daycation" | "Night") => void }) {
  const fullyOptimized = o.slotsOpen === 0;
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl border p-3.5", fullyOptimized ? "border-[var(--line)] bg-[var(--bg-2)]" : "border-rausch/20 bg-rausch/[0.03]")}>
      <div className="flex items-center justify-between">
        <span className="text-[14.5px] font-extrabold">🏡 {formatUnitDisplay(o.unitNumber, o.shortName)}</span>
        {!fullyOptimized && <span className={cn("text-[12px] font-bold", SCORE_COLOR[o.score])}>{SCORE_STARS[o.score]}</span>}
      </div>

      {fullyOptimized ? (
        <div className="rounded-lg bg-[var(--card)] px-3 py-2 text-center text-[12.5px] font-bold text-[var(--gray)]">
          ✅ Fully Optimized — no available slots
        </div>
      ) : (
        <>
          <div className="space-y-1 text-[12.5px]">
            <SlotRow label="Daycation" status={o.daycation} />
            <SlotRow label="Night Stay" status={o.night} />
          </div>
          <div className="flex items-center justify-between border-t border-dashed border-[var(--line)] pt-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Potential</span>
            <span className="text-[15px] font-extrabold text-rausch">{peso(o.potentialRevenue)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {o.daycation.bookableNow && (
              <button onClick={() => onBook(o.unitId, "Daycation")} className="btn-sm btn flex-1">Book Daycation</button>
            )}
            {o.night.bookableNow && (
              <button onClick={() => onBook(o.unitId, "Night")} className="btn-sm btn flex-1">Book Night</button>
            )}
            {o.daycation.bookableNow && o.night.bookableNow && (
              <button onClick={() => onBook(o.unitId, "Daycation")} className="btn-sm btn-primary w-full">Book Both →</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SlotRow({ label, status }: { label: string; status: UnitOpportunity["daycation"] }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--gray)]">{label}</span>
      {!status.available ? (
        <span className="font-bold text-[var(--gray)]">✔ Occupied</span>
      ) : status.missedToday ? (
        <span className="font-bold text-rausch">⏰ Window closed</span>
      ) : status.opensAt ? (
        <span className="font-bold text-amber">🕐 Opens {status.opensAt}</span>
      ) : (
        <span className="font-bold text-green">🟢 {peso(status.revenue)}</span>
      )}
    </div>
  );
}
