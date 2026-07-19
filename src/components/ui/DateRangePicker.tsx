"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/Icons";
import { manilaDayStart } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function isoOf(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayManilaIso() {
  return manilaDayStart().toISOString().slice(0, 10);
}

function pillFormat(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function longFormat(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function nightsBetween(checkIn: string, checkOut: string) {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/** One month's day grid (Sun-Sat rows), `null` for the leading/trailing blanks. */
function monthGrid(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Airbnb-style two-month range picker — a "CHECK-IN"/"CHECKOUT" pill pair
 * that opens a dual-calendar dropdown. Controlled: the caller owns
 * checkIn/checkOut and decides what a selection means (this component only
 * reports clicks), so it drops into BookingForm's existing smart-default /
 * checkout-touched logic without duplicating it.
 */
export function DateRangePicker({
  checkIn,
  checkOut,
  onSelectCheckIn,
  onSelectCheckOut,
  onClear,
  minDate,
  error,
}: {
  checkIn: string;
  checkOut: string;
  onSelectCheckIn: (iso: string) => void;
  onSelectCheckOut: (iso: string) => void;
  onClear: () => void;
  /** ISO date string — days before this are shown struck-through and unclickable. Defaults to today (Manila). */
  minDate?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const min = minDate ?? todayManilaIso();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (checkIn || min).split("-").map(Number);
    return { y, m: m - 1 };
  });
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(iso: string) {
    if (iso < min) return;
    if (!checkIn || (checkIn && checkOut)) {
      onSelectCheckIn(iso);
      onSelectCheckOut("");
      return;
    }
    // checkIn set, checkOut not: complete the range forward, or restart if
    // they picked an earlier date than their check-in.
    if (iso < checkIn) {
      onSelectCheckIn(iso);
    } else {
      onSelectCheckOut(iso);
      setOpen(false);
    }
  }

  function renderMonth(y: number, m: number) {
    const weeks = monthGrid(y, m);
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)));
    return (
      <div className="flex-1">
        <div className="mb-3 text-center text-[15px] font-extrabold">{label}</div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-[11px] font-bold text-[var(--gray)]">{w}</div>
          ))}
          {weeks.flat().map((d, i) => {
            if (d == null) return <div key={i} />;
            const iso = isoOf(y, m, d);
            const disabled = iso < min;
            const isCheckIn = iso === checkIn;
            const isCheckOut = iso === checkOut;
            const inRange = !!checkIn && !!checkOut && iso > checkIn && iso < checkOut;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => pick(iso)}
                className={cn(
                  "relative mx-auto grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold transition",
                  disabled && "cursor-not-allowed text-[var(--gray)] line-through opacity-50",
                  !disabled && !isCheckIn && !isCheckOut && "hover:bg-[var(--bg-2)]",
                  inRange && "rounded-none bg-[var(--bg-2)]",
                  (isCheckIn || isCheckOut) && "bg-[var(--ink)] text-[var(--bg)]"
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const nextM = { y: cursor.m === 11 ? cursor.y + 1 : cursor.y, m: (cursor.m + 1) % 12 };

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex items-stretch overflow-hidden rounded-2xl border border-[var(--line-2)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex-1 border-r border-[var(--line-2)] px-3.5 py-2.5 text-left transition",
            open && "ring-2 ring-inset ring-[var(--ink)]",
            error && "border-rausch"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Check-in</div>
              <div className="text-[14px] font-bold">{checkIn ? pillFormat(checkIn) : "Add date"}</div>
            </div>
            {checkIn && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onSelectCheckIn(""); onSelectCheckOut(""); }}
                className="grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className={cn("flex-1 px-3.5 py-2.5 text-left transition", open && "ring-2 ring-inset ring-[var(--ink)]", error && "border-rausch")}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Checkout</div>
              <div className="text-[14px] font-bold">{checkOut ? pillFormat(checkOut) : "Add date"}</div>
            </div>
            {checkOut && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onSelectCheckOut(""); }}
                className="grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(92vw,640px)] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[18px] font-extrabold">{checkIn && checkOut ? `${nightsBetween(checkIn, checkOut)} night${nightsBetween(checkIn, checkOut) !== 1 ? "s" : ""}` : "Select dates"}</div>
              {checkIn && checkOut && <div className="text-[13px] text-[var(--gray)]">{longFormat(checkIn)} - {longFormat(checkOut)}</div>}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: (c.m + 11) % 12 }))} className="btn-icon !h-8 !w-8" aria-label="Previous month">
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: (c.m + 1) % 12 }))} className="btn-icon !h-8 !w-8" aria-label="Next month">
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row">
            {renderMonth(cursor.y, cursor.m)}
            {renderMonth(nextM.y, nextM.m)}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3.5">
            <button type="button" onClick={onClear} className="text-[13px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Clear dates</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-primary btn-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
