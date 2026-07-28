"use client";

import { useMemo, useState } from "react";
import { manilaDayKey, manilaTodayISO } from "@/lib/manilaTime";
import { getOccupiedWindow, lastOccupiedDay } from "@/lib/stayRange";
import { formatUnitDisplay } from "@/lib/format";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; unitNumber: string; shortName: string };
type Booking = {
  id: string; unitId: string; date: string; checkOutDate: string | null; stayType: string;
  checkInTime?: string | null; checkOutTime?: string | null;
  guests: string[]; platform: string; paid: boolean; cancelledAt?: string | null; conflict?: boolean;
  source?: string; confirmationNumber?: string | null;
};

const WINDOW_DAYS = 14;
const LANE_H = 28;
const ROW_PAD = 6;
const LABEL_COL = 132;

function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return manilaDayKey(d);
}

function weekdayShort(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" });
}

function monthShort(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });
}

/**
 * A per-unit, horizontally-scrolling calendar grid — the same "who's in
 * what room, when" question the day-by-day agenda list answers, but as a
 * single glanceable timeline instead of scrolling through days one at a
 * time. Bookings that genuinely overlap the same unit (duplicates/migration
 * conflicts) stack into separate lanes rather than colliding, which doubles
 * as a visual flag for exactly the kind of data issue worth catching early.
 */
export function BookingScheduleGrid({
  units, bookings, canEdit, onSelectBooking, onCreateBooking,
}: {
  units: Unit[];
  bookings: Booking[];
  canEdit: boolean;
  onSelectBooking: (b: Booking) => void;
  onCreateBooking: (unitId: string, dateIso: string) => void;
}) {
  const todayIso = manilaTodayISO();
  const [startIso, setStartIso] = useState(todayIso);
  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => addDaysIso(startIso, i)), [startIso]);
  const dayIndex = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];

  const rows = useMemo(() => {
    return units.map((unit) => {
      const unitBookings = bookings
        .filter((b) => b.unitId === unit.id)
        .map((b) => {
          // startIsoKey stays keyed off the plain check-in day (unaffected
          // by time-of-day) — only the checkout-day mapping needed the real
          // occupied-window engine, via lastOccupiedDay (always a clean
          // UTC-midnight day marker, so it's still safe to run through
          // manilaDayKey's Asia/Manila conversion here).
          const start = new Date(b.date);
          const window = getOccupiedWindow({
            stayType: b.stayType, date: start,
            checkOutDate: b.checkOutDate ? new Date(b.checkOutDate) : null,
            checkInTime: b.checkInTime, checkOutTime: b.checkOutTime,
          });
          return { b, startIsoKey: manilaDayKey(start), lastOccupiedIso: manilaDayKey(lastOccupiedDay(window)) };
        })
        .filter((x) => x.lastOccupiedIso >= windowStart && x.startIsoKey <= windowEnd)
        .sort((a, b2) => a.startIsoKey.localeCompare(b2.startIsoKey));

      // Greedy interval packing: reuse a lane once it's free, open a new one
      // only when every existing lane is still occupied at this start date.
      const laneFreeFrom: string[] = [];
      const placed = unitBookings.map((x) => {
        let lane = laneFreeFrom.findIndex((freeFrom) => freeFrom < x.startIsoKey);
        if (lane === -1) { lane = laneFreeFrom.length; laneFreeFrom.push(x.lastOccupiedIso); }
        else laneFreeFrom[lane] = x.lastOccupiedIso;
        return { ...x, lane };
      });
      return { unit, placed, laneCount: Math.max(1, laneFreeFrom.length) };
    });
  }, [units, bookings, windowStart, windowEnd]);

  const gridTemplateColumns = `${LABEL_COL}px repeat(${WINDOW_DAYS}, minmax(52px, 1fr))`;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setStartIso((s) => addDaysIso(s, -7))} className="btn-icon !h-8 !w-8" aria-label="Previous week">
            <ArrowLeftIcon className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setStartIso(todayIso)} className="btn-sm btn-ghost !px-2.5 !py-1 text-[12px]">Today</button>
          <button onClick={() => setStartIso((s) => addDaysIso(s, 7))} className="btn-icon !h-8 !w-8" aria-label="Next week">
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
          <span className="ml-1.5 text-[12.5px] font-bold text-[var(--gray)]">
            {monthShort(windowStart)} {Number(windowStart.slice(8, 10))} – {monthShort(windowEnd)} {Number(windowEnd.slice(8, 10))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[var(--gray)]">
          <Legend swatch="bg-green" label="Paid" />
          <Legend swatch="bg-rausch" label="Unpaid" />
          <Legend swatch="bg-amber" label="Conflict" />
          <Legend swatch="bg-[var(--gray)]" label="Cancelled" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_COL + WINDOW_DAYS * 52 }}>
          <div className="grid" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-10 bg-[var(--card)] px-3 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
              Unit
            </div>
            {days.map((iso) => (
              <div
                key={iso}
                className={cn(
                  "border-l border-[var(--line)] px-1 py-1.5 text-center leading-tight",
                  iso === todayIso ? "bg-rausch/10" : ""
                )}
              >
                <div className={cn("text-[10px] font-bold uppercase", iso === todayIso ? "text-rausch" : "text-[var(--gray)]")}>{weekdayShort(iso)}</div>
                <div className={cn("text-[13px] font-extrabold", iso === todayIso ? "text-rausch" : "text-[var(--ink)]")}>{Number(iso.slice(8, 10))}</div>
              </div>
            ))}
          </div>

          {units.length === 0 && (
            <div className="border-t border-[var(--line)] px-4 py-6 text-center text-[13px] text-[var(--gray)]">No units configured.</div>
          )}

          {rows.map(({ unit, placed, laneCount }) => {
            const rowHeight = laneCount * LANE_H + ROW_PAD * 2;
            return (
              <div key={unit.id} className="relative overflow-hidden border-t border-[var(--line)]">
                <div className="grid" style={{ gridTemplateColumns, height: rowHeight }}>
                  <div className="sticky left-0 z-10 flex min-w-0 items-center overflow-hidden bg-[var(--card)] px-3 text-[12px] font-extrabold leading-tight" title={formatUnitDisplay(unit.unitNumber, unit.shortName)}>
                    <span className="truncate">{formatUnitDisplay(unit.unitNumber, unit.shortName)}</span>
                  </div>
                  {days.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onCreateBooking(unit.id, iso)}
                      className={cn("border-l border-[var(--line)]", canEdit && "hover:bg-[var(--bg-2)]", iso === todayIso && "bg-rausch/[0.03]")}
                      aria-label={`Add booking — ${unit.shortName}, ${iso}`}
                    />
                  ))}
                </div>

                <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns }}>
                  {placed.map(({ b, startIsoKey, lastOccupiedIso, lane }) => {
                    const startCol = dayIndex.get(startIsoKey) ?? 0;
                    const endCol = dayIndex.get(lastOccupiedIso) ?? WINDOW_DAYS - 1;
                    const clippedStart = startIsoKey < windowStart;
                    const clippedEnd = lastOccupiedIso > windowEnd;
                    const color = b.cancelledAt
                      ? "bg-[var(--gray)]"
                      : b.conflict
                        ? "bg-amber"
                        : b.paid
                          ? "bg-green"
                          : "bg-rausch";
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelectBooking(b)}
                        title={`${b.guests.join(", ") || "Guest"} · ${b.platform}${b.confirmationNumber ? ` · ${b.confirmationNumber}` : ""}`}
                        className={cn(
                          "pointer-events-auto flex items-center self-start overflow-hidden px-2 text-left text-[10.5px] font-bold text-white shadow-s transition hover:brightness-110",
                          color,
                          clippedStart ? "rounded-l-none" : "rounded-l-md",
                          clippedEnd ? "rounded-r-none" : "rounded-r-md",
                          b.cancelledAt && "opacity-60"
                        )}
                        style={{ gridColumn: `${startCol + 2} / span ${endCol - startCol + 1}`, marginTop: ROW_PAD + lane * LANE_H, height: LANE_H - 5 }}
                      >
                        <span className={cn("truncate", b.cancelledAt && "line-through")}>{b.guests[0] || "Guest"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-full", swatch)} />
      {label}
    </span>
  );
}
