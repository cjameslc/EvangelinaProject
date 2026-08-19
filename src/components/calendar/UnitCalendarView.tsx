"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatUnitDisplay, peso, fmtTimeStr } from "@/lib/format";
import { PLATFORM_LABEL, CALENDAR_TYPE_META, CALENDAR_CLEANING_DONE, CALENDAR_AIRBNB_COLOR } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DoorCodeReveal } from "@/components/access/DoorCodeReveal";

type Unit = {
  id: string; name: string; unitNumber: string; shortName: string; photoUrl: string | null;
  rating: number; nightlyRate: number; location: string;
};
type BlockBooking = {
  id: string; confirmationNumber: string | null; platform: string; amount: number; paid: boolean; dpAmount: number | null;
  checkInTime: string | null; checkOutTime: string | null; pax: number | null; contactNumber: string;
  method: string | null; dpMethod: string | null;
  booker: { name: string } | null; cleaner: { name: string } | null;
} | null;
type Block = { id: string; unitId: string; type: string; date: string; endDate: string | null; guest: string | null; note: string | null; status: string; booking?: BlockBooking };

// Same legend/colors as the multi-unit Gantt at /calendar (src/lib/constants.ts)
// — both calendar surfaces show one consistent set of labels/colors instead
// of two independently-maintained lists that could drift apart.
const TYPE_COLOR: Record<string, string> = Object.fromEntries(Object.entries(CALENDAR_TYPE_META).map(([k, v]) => [k, v.color]));
const STATUS_COLOR = { paid: "#1E9E52", pending: "#E08A2C" };
const STAY_TYPE_KEYS = ["Daycation", "Night", "Full", "Flexible"];

function manilaToday(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${iso}T00:00:00Z`);
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getUTCMonth() === end.getUTCMonth();
  const fmt = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" }).format(d);
  return sameMonth
    ? `${new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(weekStart)} ${weekStart.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`
    : `${fmt(weekStart, false)} – ${fmt(end, true)}`;
}
/** Every calendar block whose [date, endDate) span covers the given day — endDate null means a single-day block. */
function blocksOnDay(blocks: Block[], day: Date): Block[] {
  const dayMs = day.getTime();
  return blocks.filter((b) => {
    const start = new Date(b.date).getTime();
    const end = b.endDate ? new Date(b.endDate).getTime() : start + 86400000;
    return dayMs >= start && dayMs < end;
  });
}
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
/** "1799" -> "₱1.8K" — the compact form the month grid's day tiles use so a
 * price fits next to a day number without wrapping (peso() from format.ts
 * is for full amounts elsewhere; this is a display-only variant local to
 * this grid). */
function compactPeso(n: number): string {
  if (n >= 1000) {
    const k = Math.round((n / 1000) * 10) / 10;
    return `₱${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `₱${Math.round(n)}`;
}
/** For one week row, collapses each day's winning block (stay takes
 * priority over Cleaning, matching the old per-cell .find() order) into
 * contiguous multi-day segments — so a 2-night stay renders as ONE bar
 * spanning both cells instead of two separately-labeled cells. */
function weekBarSegments(weekDays: Date[], blocks: Block[]): { block: Block; colStart: number; colSpan: number; isStart: boolean }[] {
  const dayWinner = weekDays.map((day) => {
    const onDay = blocksOnDay(blocks, day);
    return onDay.find((b) => STAY_TYPE_KEYS.includes(b.type)) ?? onDay.find((b) => b.type === "Cleaning") ?? null;
  });
  const segs: { block: Block; colStart: number; colSpan: number; isStart: boolean }[] = [];
  let i = 0;
  while (i < 7) {
    const b = dayWinner[i];
    if (!b) { i++; continue; }
    let span = 1;
    while (i + span < 7 && dayWinner[i + span]?.id === b.id) span++;
    segs.push({ block: b, colStart: i, colSpan: span, isStart: isoDate(new Date(b.date)) === isoDate(weekDays[i]) });
    i += span;
  }
  return segs;
}

// DoorCodeReveal moved to src/components/access/DoorCodeReveal.tsx — now
// shared with the Bookings row and the main Calendar's detail modal
// instead of reimplemented per surface.

export function UnitCalendarView({ initialUnitId, allUnits, blocks: initialBlocks, canRevealAccessCode, canGenerateAccessLink, canDragReschedule }: { initialUnitId: string; allUnits: Unit[]; blocks: Block[]; canRevealAccessCode: boolean; canGenerateAccessLink: boolean; canDragReschedule: boolean }) {
  const router = useRouter();
  const today = useMemo(() => manilaToday(), []);

  // Same architecture as the main /calendar Gantt page (CalendarView.tsx):
  // one mount, every unit's data already in hand, and "which unit is
  // focused" is plain client state — not a route per unit. Switching used
  // to navigate to a different /calendar/[unitId] page, which the segment's
  // loading.tsx remounted on every switch — silently resetting whatever
  // month/week the user was on back to "today", and round-tripping the
  // server for data already sitting in this component's props. There's
  // nothing to remount now, so this state just carries across a switch for
  // free, the same way Main Calendar's unit/platform filters never reset
  // the viewed month either.
  const [focusedUnitId, setFocusedUnitId] = useState(initialUnitId);
  const unit = useMemo(() => allUnits.find((u) => u.id === focusedUnitId) ?? allUnits[0], [allUnits, focusedUnitId]);

  // Local state (not just the initial server-fetched prop) — the context
  // menu's "Block for maintenance" / "Remove block" actions (see below)
  // create/delete real CalendarBlock rows via the existing /api/calendar
  // endpoints and need the grid to reflect that immediately, the same way
  // every other mutation in this app updates in place rather than forcing
  // a full page reload. Holds every unit's blocks (matching allUnits'
  // scope) — `blocks` below is just the current unit's slice of it.
  const [allBlocks, setAllBlocks] = useState(initialBlocks);
  const blocks = useMemo(() => allBlocks.filter((b) => b.unitId === focusedUnitId), [allBlocks, focusedUnitId]);

  const [viewMonth, setViewMonth] = useState(() => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const [openBlock, setOpenBlock] = useState<Block | null>(null);

  // Month = overview (one summary per day, matches the existing design);
  // Week = detail (every block on a day gets its own row, for closely
  // inspecting a specific week rather than scanning a whole month).
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState(() => addDays(today, -today.getUTCDay()));

  // No navigation — just swap which unit's slice of already-loaded data is
  // shown. Transient per-unit UI state (an open detail popover, a
  // right-click menu, an in-flight drag) is explicitly cleared since it can
  // reference the unit being left; the viewed date/mode is deliberately
  // *not* touched, since changing the unit must not change the date. The
  // URL is kept in sync via history.replaceState (no Next.js navigation,
  // so no remount) purely so the address bar/refresh still reflect the
  // focused unit — the actual state of record is focusedUnitId.
  function switchUnit(id: string) {
    if (id === focusedUnitId) return;
    setFocusedUnitId(id);
    setOpenBlock(null);
    setContextMenu(null);
    setDragBlockId(null);
    setDropTargetIso(null);
    setPendingMove(null);
    setMoveError(null);
    setBlockingMaintenance(false);
    window.history.replaceState(null, "", `/calendar/${id}`);
  }

  const grid = useMemo(() => {
    const monthStart = viewMonth;
    const firstWeekday = monthStart.getUTCDay();
    const gridStart = addDays(monthStart, -firstWeekday);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMonth]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7)), [grid]);

  const monthEnd = useMemo(() => new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth() + 1, 1)), [viewMonth]);

  const monthStats = useMemo(() => {
    const daysInMonth = Math.round((monthEnd.getTime() - viewMonth.getTime()) / 86400000);
    let booked = 0, cleaning = 0, maintenance = 0, revenueCentavos = 0;
    for (let i = 0; i < daysInMonth; i++) {
      const day = addDays(viewMonth, i);
      const onDay = blocksOnDay(blocks, day);
      const stay = onDay.find((b) => b.type === "Daycation" || b.type === "Night" || b.type === "Full" || b.type === "Flexible");
      const clean = onDay.find((b) => b.type === "Cleaning");
      const maint = onDay.find((b) => b.type === "Maintenance");
      if (stay) booked++;
      if (clean) cleaning++;
      if (maint) maintenance++;
      if (stay?.booking) {
        // Attribute revenue to check-in day only, not every occupied night —
        // otherwise a 2-night stay would double-count its own amount.
        if (isoDate(new Date(stay.date)) === isoDate(day)) revenueCentavos += stay.booking.amount;
      }
    }
    const available = Math.max(0, daysInMonth - booked - maintenance);
    const occupancyPct = daysInMonth > 0 ? Math.round((booked / daysInMonth) * 100) : 0;
    const avgRate = booked > 0 ? Math.round(revenueCentavos / booked) : unit.nightlyRate;
    return { daysInMonth, booked, available, cleaning, maintenance, revenueCentavos, occupancyPct, avgRate };
  }, [blocks, viewMonth, monthEnd, unit.nightlyRate]);

  const todayBlocks = blocksOnDay(blocks, today);
  const todayStay = todayBlocks.find((b) => b.type !== "Cleaning" && b.type !== "Maintenance");
  const todayStatus = todayStay ? "Occupied" : todayBlocks.some((b) => b.type === "Maintenance") ? "Maintenance" : "Available";

  // Real arrivals/departures/cleaning for today, not a fabricated summary —
  // "arrival" = a stay block whose check-in day is today; "departure" = a
  // stay block whose last OCCUPIED day is today (endDate is exclusive, so a
  // Full stay date=Aug7/endDate=Aug9 occupies Aug7–8 and departs Aug9).
  const todaysOps = useMemo(() => {
    const tomorrow = addDays(today, 1);
    const arrivals: Block[] = [];
    const departures: Block[] = [];
    const cleaning: Block[] = [];
    for (const b of blocks) {
      const isStay = b.type === "Daycation" || b.type === "Night" || b.type === "Full" || b.type === "Flexible";
      if (isStay) {
        if (isoDate(new Date(b.date)) === isoDate(today)) arrivals.push(b);
        const effectiveEnd = b.endDate ? new Date(b.endDate) : addDays(new Date(b.date), 1);
        if (isoDate(effectiveEnd) === isoDate(tomorrow)) departures.push(b);
      } else if (b.type === "Cleaning") {
        const start = new Date(b.date);
        const end = b.endDate ? new Date(b.endDate) : addDays(start, 1);
        if (today.getTime() >= start.getTime() && today.getTime() < end.getTime()) cleaning.push(b);
      }
    }
    return { arrivals, departures, cleaning };
  }, [blocks, today]);
  const totalOpsCount = todaysOps.arrivals.length + todaysOps.departures.length + todaysOps.cleaning.length;
  const [opsOpen, setOpsOpen] = useState(false);

  // Right-click quick actions — reuses the existing standalone-CalendarBlock
  // CRUD (POST/DELETE /api/calendar) that already backs Maintenance/
  // Cleaning blocks, rather than a new endpoint. "Remove block" only ever
  // targets a block with no linked booking (a real guest stay's calendar
  // entry, or the housekeeping-mirrored Cleaning block, always goes through
  // Bookings/Housekeeping's own flows instead — deleting those here would
  // desync them from their real source of truth).
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; day: Date; onDay: Block[] } | null>(null);
  const [blockingMaintenance, setBlockingMaintenance] = useState(false);

  function openContextMenu(e: React.MouseEvent, day: Date) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, day, onDay: blocksOnDay(blocks, day) });
  }

  async function blockForMaintenance(day: Date) {
    setBlockingMaintenance(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: unit.id, type: "Maintenance", date: isoDate(day), note: "Blocked from the calendar" }),
      });
      if (res.ok) { const newBlock = await res.json(); setAllBlocks((b) => [...b, newBlock]); }
    } finally {
      setBlockingMaintenance(false);
      setContextMenu(null);
    }
  }

  async function removeBlock(blockId: string) {
    const res = await fetch(`/api/calendar/${blockId}`, { method: "DELETE" });
    if (res.ok) setAllBlocks((b) => b.filter((x) => x.id !== blockId));
    setContextMenu(null);
  }

  // Drag-and-drop rescheduling. Only ever draggable from a stay's own
  // check-in day (not "continues" days), only for a stay that hasn't
  // started yet (never a past or in-progress guest), and only when
  // canDragReschedule (a role-level gate — the server-side PATCH is the
  // real authority, same as every other edit path in this app; a Booker
  // dragging a booking they don't personally own still gets rejected there
  // via canEditSpecificBooking, this is just the client-side affordance).
  // Dropping is never a silent commit — it always opens a confirm step,
  // since an accidental drag is a much easier real mistake than a menu
  // click, and this mutates a real guest's stay dates.
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dropTargetIso, setDropTargetIso] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ block: Block; newDate: Date; newCheckOutDate: Date | null } | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  function canDragBlock(b: Block, isCheckInDay: boolean): boolean {
    return canDragReschedule && !!b.booking && STAY_TYPE_KEYS.includes(b.type) && isCheckInDay && new Date(b.date).getTime() >= today.getTime();
  }

  function handleDragStart(e: React.DragEvent, block: Block) {
    e.dataTransfer.effectAllowed = "move";
    setDragBlockId(block.id);
  }
  function handleDragOver(e: React.DragEvent, day: Date) {
    if (!dragBlockId) return;
    e.preventDefault();
    setDropTargetIso(isoDate(day));
  }
  function handleDrop(e: React.DragEvent, day: Date) {
    e.preventDefault();
    setDropTargetIso(null);
    const block = blocks.find((b) => b.id === dragBlockId);
    setDragBlockId(null);
    if (!block) return;
    const originalStart = new Date(block.date);
    if (isoDate(originalStart) === isoDate(day)) return;
    const deltaMs = day.getTime() - originalStart.getTime();
    const newCheckOutDate = block.endDate ? new Date(new Date(block.endDate).getTime() + deltaMs) : null;
    setMoveError(null);
    setPendingMove({ block, newDate: day, newCheckOutDate });
  }

  async function confirmMove() {
    if (!pendingMove || !pendingMove.block.booking) return;
    setMoving(true);
    setMoveError(null);
    try {
      const res = await fetch(`/api/bookings/${pendingMove.block.booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: isoDate(pendingMove.newDate),
          checkOutDate: pendingMove.newCheckOutDate ? isoDate(pendingMove.newCheckOutDate) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMoveError(data.error ?? "Couldn't move this booking."); return; }
      const movedId = pendingMove.block.id;
      const newDateIso = isoDate(pendingMove.newDate);
      const newEndIso = pendingMove.newCheckOutDate ? isoDate(pendingMove.newCheckOutDate) : null;
      setAllBlocks((prev) => prev.map((b) => (b.id === movedId ? { ...b, date: newDateIso, endDate: newEndIso } : b)));
      setPendingMove(null);
    } finally {
      setMoving(false);
    }
  }

  function nav(deltaMonths: number) {
    setViewMonth((v) => new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth() + deltaMonths, 1)));
  }
  function navWeek(deltaWeeks: number) {
    setWeekStart((v) => addDays(v, deltaWeeks * 7));
  }
  function goToToday() {
    setViewMonth(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
    setWeekStart(addDays(today, -today.getUTCDay()));
  }
  // Prev/next only ever stepped by a fixed week or month — no way to land
  // on an arbitrary date without clicking through every increment in
  // between. Same "clickable label overlaying a hidden native picker"
  // pattern already established in CalendarView.tsx's own "Jump to month"
  // control, adapted per view mode: month mode jumps by <input type="month">
  // (unambiguous — any day within it resolves the same month), week mode
  // jumps by <input type="date"> and resolves to that date's own week
  // (Sunday-start, matching how weekStart is derived everywhere else here).
  const jumpInputRef = useRef<HTMLInputElement | null>(null);
  function jumpToMonth(value: string) {
    if (!value) return;
    const [y, m] = value.split("-").map(Number);
    setViewMonth(new Date(Date.UTC(y, m - 1, 1)));
  }
  function jumpToWeek(value: string) {
    if (!value) return;
    const picked = new Date(`${value}T00:00:00Z`);
    setWeekStart(addDays(picked, -picked.getUTCDay()));
  }

  return (
    <div className="unit-cal-luxury min-h-screen bg-[var(--uc-cream)]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:px-6 lg:py-8">
        {/* ---------- Sidebar ---------- */}
        <aside className="flex-none lg:w-[280px]">
          <Link href="/calendar" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--uc-warm-gray)] hover:text-[var(--uc-ink)]">
            ← Back to All Units
          </Link>

          <div className="overflow-hidden rounded-[22px] border border-[var(--uc-line)] bg-[var(--uc-card)] shadow-[0_8px_30px_rgba(28,26,23,.06)]">
            <div className="relative aspect-[4/3] w-full bg-[var(--uc-gold-10)]">
              {unit.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={unit.photoUrl} alt={unit.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-4xl">🏡</div>
              )}
              <span
                className={cn(
                  "absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md",
                  todayStatus === "Occupied" ? "bg-[var(--uc-charcoal-70)]" : todayStatus === "Maintenance" ? "bg-[#8B5E34]/85" : "bg-[#1E9E52]/85"
                )}
              >
                Today: {todayStatus}
              </span>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--uc-gold)]">Unit {unit.unitNumber}</div>
              <h1 className="mt-0.5 font-semibold text-[19px] text-[var(--uc-ink)]">{unit.shortName}</h1>
              <div className="mt-1 flex items-center gap-1 text-[13px] text-[var(--uc-warm-gray)]">
                <span className="text-[var(--uc-gold)]">★</span> {unit.rating.toFixed(1)} <span className="mx-1">·</span> {unit.location}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--uc-line)] pt-4">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--uc-warm-gray)]">Price</div>
                  <div className="mt-0.5 text-[15px] font-bold text-[var(--uc-ink)]">{peso(unit.nightlyRate)}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--uc-warm-gray)]">This Month</div>
                  <div className="mt-0.5 text-[15px] font-bold text-[var(--uc-ink)]">{monthStats.occupancyPct}% occupied</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 hidden lg:block">
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-[var(--uc-warm-gray)]">Switch Unit</div>
            <div className="space-y-1.5">
              {allUnits.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => switchUnit(u.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition",
                    u.id === unit.id ? "border-[var(--uc-gold)] bg-[var(--uc-gold-10)]" : "border-transparent hover:bg-[var(--uc-gold-10)]"
                  )}
                >
                  <div className={cn("h-11 w-11 flex-none overflow-hidden rounded-xl bg-[var(--uc-gold-10)]", u.id === unit.id && "ring-2 ring-[var(--uc-gold)] ring-offset-1")}>
                    {u.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.photoUrl} alt={u.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[11px] font-bold text-[var(--uc-gold)]">{initials(u.shortName)}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-[var(--uc-ink)]">{formatUnitDisplay(u.unitNumber, u.shortName)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ---------- Main ---------- */}
        <main className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => jumpInputRef.current?.showPicker?.() ?? jumpInputRef.current?.click()}
                className="rounded-lg px-1 py-0.5 text-left font-semibold text-[24px] text-[var(--uc-ink)] hover:bg-[var(--uc-gold-10)]"
                aria-label={viewMode === "month" ? "Jump to month" : "Jump to week"}
                title={viewMode === "month" ? "Click to jump to a specific month" : "Click to jump to any date's week"}
              >
                {viewMode === "month" ? monthLabel(viewMonth) : weekLabel(weekStart)}
              </button>
              {viewMode === "month" ? (
                <input
                  key="month-jump"
                  ref={jumpInputRef}
                  type="month"
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => jumpToMonth(e.target.value)}
                />
              ) : (
                <input
                  key="week-jump"
                  ref={jumpInputRef}
                  type="date"
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => jumpToWeek(e.target.value)}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-full border border-[var(--uc-line)] p-0.5">
                <button
                  onClick={() => setViewMode("month")}
                  className={cn("rounded-full px-3 py-1 text-[12px] font-bold transition", viewMode === "month" ? "bg-[var(--uc-charcoal)] text-white" : "text-[var(--uc-warm-gray)] hover:text-[var(--uc-ink)]")}
                >
                  Month
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  className={cn("rounded-full px-3 py-1 text-[12px] font-bold transition", viewMode === "week" ? "bg-[var(--uc-charcoal)] text-white" : "text-[var(--uc-warm-gray)] hover:text-[var(--uc-ink)]")}
                >
                  Week
                </button>
              </div>
              <button onClick={goToToday} className="rounded-full border border-[var(--uc-line)] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--uc-ink)] transition hover:border-[var(--uc-gold)]">
                Today
              </button>
              {viewMode === "month" ? (
                <>
                  <button onClick={() => nav(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-full border border-[var(--uc-line)] text-[var(--uc-ink)] transition hover:border-[var(--uc-gold)]">‹</button>
                  <button onClick={() => nav(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-full border border-[var(--uc-line)] text-[var(--uc-ink)] transition hover:border-[var(--uc-gold)]">›</button>
                </>
              ) : (
                <>
                  <button onClick={() => navWeek(-1)} aria-label="Previous week" className="grid h-8 w-8 place-items-center rounded-full border border-[var(--uc-line)] text-[var(--uc-ink)] transition hover:border-[var(--uc-gold)]">‹</button>
                  <button onClick={() => navWeek(1)} aria-label="Next week" className="grid h-8 w-8 place-items-center rounded-full border border-[var(--uc-line)] text-[var(--uc-ink)] transition hover:border-[var(--uc-gold)]">›</button>
                </>
              )}
            </div>
          </div>

          {/* Legend — same items/labels/colors as the multi-unit Gantt at
              /calendar (CALENDAR_TYPE_META etc. in src/lib/constants.ts). */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(["Full", "Night", "Daycation", "Flexible", "Cleaning", "Maintenance"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uc-line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--uc-ink)]">
                <span className="h-2 w-2 rounded-full" style={{ background: CALENDAR_TYPE_META[k].color }} />
                {CALENDAR_TYPE_META[k].icon} {CALENDAR_TYPE_META[k].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uc-line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--uc-ink)]">
              <span className="h-2 w-2 rounded-full" style={{ background: CALENDAR_CLEANING_DONE.color }} />
              {CALENDAR_CLEANING_DONE.icon} {CALENDAR_CLEANING_DONE.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uc-line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--uc-ink)]">
              <span className="h-2 w-2 rounded-full" style={{ background: CALENDAR_AIRBNB_COLOR }} />
              🏠 Airbnb (always 21-Hour)
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uc-line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--uc-ink)]">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.paid }} /> Paid
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uc-line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--uc-ink)]">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.pending }} /> Unpaid
            </span>
          </div>

          {/* Grid */}
          {viewMode === "month" ? (
          <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--uc-line)] bg-[var(--uc-card)]">
            <div className="grid grid-cols-7 border-b border-[var(--uc-line)] bg-[var(--uc-gold-10)]">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--uc-warm-gray)]">{d}</div>
              ))}
            </div>
            {weeks.map((weekDays, wi) => {
              const barSegments = weekBarSegments(weekDays, blocks);
              return (
                <div key={wi} className={cn("relative grid grid-cols-7", wi < weeks.length - 1 && "border-b border-[var(--uc-line)]")}>
                  {weekDays.map((day, di) => {
                    const inMonth = day.getUTCMonth() === viewMonth.getUTCMonth();
                    const isToday = isoDate(day) === isoDate(today);
                    const isPast = day.getTime() < today.getTime();
                    const onDay = blocksOnDay(blocks, day);
                    const stay = onDay.find((b) => STAY_TYPE_KEYS.includes(b.type));
                    const maint = onDay.find((b) => b.type === "Maintenance");
                    const cleaning = onDay.find((b) => b.type === "Cleaning");
                    const barred = !!stay || !!cleaning;
                    const isOpenSlot = !stay && !maint && !cleaning && inMonth && !isPast;
                    const isCheckInDay = stay && isoDate(new Date(stay.date)) === isoDate(day);
                    const draggableHere = stay && isCheckInDay && canDragBlock(stay, true);

                    return (
                      <button
                        key={isoDate(day)}
                        onClick={() => {
                          if (stay || maint || cleaning) setOpenBlock(stay ?? maint ?? cleaning ?? null);
                          else if (isOpenSlot) router.push(`/bookings?prefillUnit=${unit.id}&prefillDate=${isoDate(day)}&prefillStayType=Full`);
                        }}
                        onContextMenu={(e) => (isOpenSlot || stay || maint || cleaning) && openContextMenu(e, day)}
                        draggable={!!draggableHere}
                        onDragStart={draggableHere ? (e) => handleDragStart(e, stay) : undefined}
                        onDragOver={(e) => handleDragOver(e, day)}
                        onDragLeave={() => setDropTargetIso((d) => (d === isoDate(day) ? null : d))}
                        onDrop={(e) => handleDrop(e, day)}
                        disabled={!stay && !maint && !cleaning && !isOpenSlot}
                        className={cn(
                          "group relative flex min-h-[104px] flex-col gap-1 p-2 text-left transition",
                          di < 6 && "border-r border-[var(--uc-line)]",
                          !inMonth && "bg-[var(--uc-gold-10)]/40",
                          isPast && inMonth && "bg-[var(--uc-gold-10)]/30",
                          maint && "bg-[var(--uc-gold-10)]/50",
                          (stay || cleaning || maint) && "cursor-pointer hover:z-10 hover:shadow-[0_6px_18px_rgba(28,26,23,.1)]",
                          isOpenSlot && "cursor-pointer hover:z-10 hover:bg-[var(--uc-gold-10)] hover:shadow-[0_6px_18px_rgba(28,26,23,.1)]",
                          draggableHere && "cursor-grab active:cursor-grabbing",
                          dropTargetIso === isoDate(day) && "ring-2 ring-[var(--uc-gold)] ring-inset"
                        )}
                      >
                        <span className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-bold",
                          isToday ? "bg-[var(--uc-gold)] text-white" : inMonth ? "text-[var(--uc-ink)]" : "text-[var(--uc-warm-gray)]",
                          isPast && !isToday && inMonth && "text-[var(--uc-warm-gray)]",
                          maint && !isToday && "text-[var(--uc-warm-gray)] line-through decoration-2"
                        )}>
                          {day.getUTCDate()}
                        </span>

                        {!barred && inMonth && !isPast && (
                          <span className="mt-auto text-[11px] font-semibold text-[var(--uc-warm-gray)]">{compactPeso(unit.nightlyRate)}</span>
                        )}
                        {isOpenSlot && (
                          <span className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-[var(--uc-gold)] text-[13px] font-bold leading-none text-white group-hover:flex">
                            +
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Spanning guest / cleaning bars — one continuous pill across every
                      day a stay or turnover actually covers, instead of a separate
                      label repeated in each cell. */}
                  {barSegments.map((seg) => {
                    const isStay = STAY_TYPE_KEYS.includes(seg.block.type);
                    const isAirbnb = seg.block.booking?.platform === "Airbnb";
                    // A Cleaning block that's been closed off (endDate set —
                    // housekeeping marked the unit clean) gets the same
                    // distinct "Cleaned" color/icon the main Gantt calendar
                    // uses, instead of staying the plain in-progress color.
                    const cleaningDone = seg.block.type === "Cleaning" && !!seg.block.endDate;
                    const color = cleaningDone ? CALENDAR_CLEANING_DONE.color : TYPE_COLOR[seg.block.type];
                    const pax = seg.block.booking?.pax ?? null;
                    const draggableHere = seg.isStart && isStay && canDragBlock(seg.block, true);
                    return (
                      <button
                        key={`${seg.block.id}-${seg.colStart}`}
                        onClick={() => setOpenBlock(seg.block)}
                        draggable={draggableHere}
                        onDragStart={draggableHere ? (e) => handleDragStart(e, seg.block) : undefined}
                        className={cn(
                          "absolute bottom-2 z-10 flex items-center gap-1.5 overflow-hidden rounded-full px-2 py-1.5 text-left shadow-sm transition hover:brightness-110",
                          // The charcoal fill is fixed-dark in both themes (see
                          // globals.css) — against the dark-mode card it barely
                          // separates from the background without this ring.
                          isStay && "ring-1 ring-[var(--uc-gold-20)]",
                          draggableHere && "cursor-grab active:cursor-grabbing"
                        )}
                        style={{
                          left: `calc(${(seg.colStart / 7) * 100}% + 4px)`,
                          width: `calc(${(seg.colSpan / 7) * 100}% - 8px)`,
                          background: isStay ? "var(--uc-charcoal)" : color,
                        }}
                      >
                        {seg.isStart && isStay && (
                          <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[9px] font-bold text-[var(--uc-gold-ink)]" style={{ background: "var(--uc-gold)" }}>
                            {initials(seg.block.guest ?? "Guest")}
                          </span>
                        )}
                        {seg.isStart && isStay && isAirbnb && (
                          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: CALENDAR_AIRBNB_COLOR }} aria-label="Airbnb" title="Airbnb (always 21-Hour)" />
                        )}
                        <span className="truncate text-[11px] font-bold text-white">
                          {isStay
                            ? `${seg.block.guest ?? "Guest"}${seg.isStart && pax && pax > 1 ? ` +${pax - 1}` : ""}`
                            : cleaningDone ? CALENDAR_CLEANING_DONE.label : CALENDAR_TYPE_META[seg.block.type].label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          ) : (
          <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--uc-line)] bg-[var(--uc-card)]">
            <div className="grid grid-cols-7 border-b border-[var(--uc-line)] bg-[var(--uc-gold-10)]">
              {weekDays.map((day) => {
                const isToday = isoDate(day) === isoDate(today);
                const isPast = day.getTime() < today.getTime();
                return (
                  <div key={isoDate(day)} className={cn("px-2 py-2 text-center", isPast && "opacity-50")}>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--uc-warm-gray)]">
                      {new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(day)}
                    </div>
                    <div className={cn("mx-auto mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-bold", isToday ? "bg-[var(--uc-gold)] text-white" : "text-[var(--uc-ink)]")}>
                      {day.getUTCDate()}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7">
              {weekDays.map((day) => {
                const isPast = day.getTime() < today.getTime();
                const onDay = blocksOnDay(blocks, day);
                const isOpenSlot = onDay.length === 0 && !isPast;

                return (
                  <div
                    key={isoDate(day)}
                    onContextMenu={(e) => openContextMenu(e, day)}
                    onDragOver={(e) => handleDragOver(e, day)}
                    onDragLeave={() => setDropTargetIso((d) => (d === isoDate(day) ? null : d))}
                    onDrop={(e) => handleDrop(e, day)}
                    className={cn(
                      "flex min-h-[340px] flex-col gap-1.5 border-r border-[var(--uc-line)] p-2 transition last:border-r-0",
                      isPast && "bg-[var(--uc-gold-10)]/30",
                      dropTargetIso === isoDate(day) && "bg-[var(--uc-gold-10)] ring-2 ring-[var(--uc-gold)] ring-inset"
                    )}
                  >
                    {onDay.length === 0 ? (
                      isOpenSlot ? (
                        <button
                          onClick={() => router.push(`/bookings?prefillUnit=${unit.id}&prefillDate=${isoDate(day)}&prefillStayType=Full`)}
                          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--uc-line)] text-[var(--uc-warm-gray)] transition hover:border-[var(--uc-gold)] hover:bg-[var(--uc-gold-10)] hover:text-[var(--uc-ink)]"
                        >
                          <span className="text-[18px] font-bold leading-none">+</span>
                          <span className="text-[11px] font-semibold">{peso(unit.nightlyRate)}</span>
                        </button>
                      ) : (
                        <div className="flex flex-1 items-center justify-center text-[11px] text-[var(--uc-warm-gray)]/60">—</div>
                      )
                    ) : (
                      onDay.map((b) => {
                        const isStay = STAY_TYPE_KEYS.includes(b.type);
                        const isAirbnb = b.booking?.platform === "Airbnb";
                        const cleaningDone = b.type === "Cleaning" && !!b.endDate;
                        const color = cleaningDone ? CALENDAR_CLEANING_DONE.color : TYPE_COLOR[b.type];
                        const isCheckInDay = isoDate(new Date(b.date)) === isoDate(day);
                        const draggableHere = isCheckInDay && canDragBlock(b, true);
                        return (
                          <button
                            key={b.id}
                            onClick={() => setOpenBlock(b)}
                            draggable={draggableHere}
                            onDragStart={draggableHere ? (e) => handleDragStart(e, b) : undefined}
                            className={cn("rounded-lg px-2 py-1.5 text-left transition hover:brightness-95", draggableHere && "cursor-grab active:cursor-grabbing")}
                            style={{ background: `${color}18` }}
                          >
                            {isStay ? (
                              isCheckInDay ? (
                                <>
                                  <div className="flex items-center gap-1">
                                    <span className="grid h-4 w-4 flex-none place-items-center rounded-full text-[8px] font-bold text-white" style={{ background: color }}>
                                      {initials(b.guest ?? "Guest")}
                                    </span>
                                    <span className="truncate text-[11.5px] font-bold text-[var(--uc-ink)]">{b.guest ?? "Guest"}</span>
                                    {isAirbnb && <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: CALENDAR_AIRBNB_COLOR }} aria-label="Airbnb" title="Airbnb (always 21-Hour)" />}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.booking?.paid ? STATUS_COLOR.paid : STATUS_COLOR.pending }} />
                                    <span className="text-[10px] font-semibold text-[var(--uc-warm-gray)]">
                                      {PLATFORM_LABEL[b.booking?.platform ?? ""] ?? b.booking?.platform}
                                      {b.booking?.checkInTime && ` · ${fmtTimeStr(b.booking.checkInTime)}`}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <span className="text-[11px] font-semibold text-[var(--uc-warm-gray)]">{b.guest ?? "Guest"} · continues</span>
                              )
                            ) : (
                              <span className="text-[11px] font-bold" style={{ color }}>{cleaningDone ? CALENDAR_CLEANING_DONE.label : CALENDAR_TYPE_META[b.type].label}</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Summary */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Occupancy", value: `${monthStats.occupancyPct}%` },
              { label: "Revenue", value: peso(monthStats.revenueCentavos) },
              { label: "Booked Days", value: String(monthStats.booked) },
              { label: "Available", value: String(monthStats.available) },
              { label: "Cleaning", value: String(monthStats.cleaning) },
              { label: "Maintenance", value: String(monthStats.maintenance) },
              { label: "Avg Rate", value: peso(monthStats.avgRate) },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-[var(--uc-line)] bg-[var(--uc-card)] p-3.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--uc-warm-gray)]">{s.label}</div>
                <div className="mt-1 text-[18px] font-bold text-[var(--uc-ink)]">{s.value}</div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Floating Today's Operations panel */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {opsOpen && (
          <div className="w-[300px] rounded-[20px] border border-[var(--uc-line)] bg-[var(--uc-card)] p-4 shadow-[0_16px_40px_rgba(28,26,23,.18)]">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-[15px] text-[var(--uc-ink)]">Today&rsquo;s Operations</h4>
              <button onClick={() => setOpsOpen(false)} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-full text-[var(--uc-warm-gray)] hover:bg-[var(--uc-gold-10)]">✕</button>
            </div>
            {totalOpsCount === 0 ? (
              <p className="mt-3 text-[13px] text-[var(--uc-warm-gray)]">Nothing scheduled for this unit today.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {todaysOps.arrivals.length > 0 && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#1E9E52]">Arrivals ({todaysOps.arrivals.length})</div>
                    {todaysOps.arrivals.map((b) => (
                      <button key={b.id} onClick={() => setOpenBlock(b)} className="mt-1 block w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold text-[var(--uc-ink)] hover:bg-[var(--uc-gold-10)]">
                        {b.guest ?? "Guest"} {b.booking?.checkInTime ? `· ${fmtTimeStr(b.booking.checkInTime)}` : ""}
                      </button>
                    ))}
                  </div>
                )}
                {todaysOps.departures.length > 0 && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#3B71E8]">Departures ({todaysOps.departures.length})</div>
                    {todaysOps.departures.map((b) => (
                      <button key={b.id} onClick={() => setOpenBlock(b)} className="mt-1 block w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold text-[var(--uc-ink)] hover:bg-[var(--uc-gold-10)]">
                        {b.guest ?? "Guest"} {b.booking?.checkOutTime ? `· ${fmtTimeStr(b.booking.checkOutTime)}` : ""}
                      </button>
                    ))}
                  </div>
                )}
                {todaysOps.cleaning.length > 0 && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#0F9B8E]">Cleaning ({todaysOps.cleaning.length})</div>
                    {todaysOps.cleaning.map((b) => (
                      <div key={b.id} className="mt-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[var(--uc-ink)]">
                        {b.endDate ? "Cleaned ✓" : "In progress…"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setOpsOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-[var(--uc-charcoal)] px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(28,26,23,.28)] transition hover:opacity-90"
        >
          Today&rsquo;s Operations
          {totalOpsCount > 0 && (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--uc-gold)] text-[11px] font-bold text-[var(--uc-gold-ink)]">{totalOpsCount}</span>
          )}
        </button>
      </div>

      {/* Detail popover / mobile bottom sheet */}
      {openBlock && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setOpenBlock(null)}>
          <div
            role="dialog" aria-modal="true"
            className="w-full max-w-[420px] rounded-t-[24px] border border-[var(--uc-line)] bg-[var(--uc-card)] p-5 shadow-2xl sm:rounded-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: openBlock.type === "Cleaning" && openBlock.endDate ? CALENDAR_CLEANING_DONE.color : TYPE_COLOR[openBlock.type] }}
                >
                  {openBlock.type === "Cleaning" && openBlock.endDate
                    ? CALENDAR_CLEANING_DONE.label
                    : CALENDAR_TYPE_META[openBlock.type]?.label ?? openBlock.type}
                </div>
                <h3 className="mt-0.5 font-semibold text-[18px] text-[var(--uc-ink)]">{openBlock.guest ?? "Unit block"}</h3>
              </div>
              <button onClick={() => setOpenBlock(null)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-[var(--uc-warm-gray)] hover:bg-[var(--uc-gold-10)]">✕</button>
            </div>

            <div className="mt-4 space-y-2.5 text-[13.5px]">
              <div className="flex justify-between"><span className="text-[var(--uc-warm-gray)]">Dates</span><span className="font-semibold text-[var(--uc-ink)]">{isoDate(new Date(openBlock.date))}{openBlock.endDate ? ` → ${isoDate(new Date(openBlock.endDate))}` : ""}</span></div>
              {openBlock.booking && (
                <>
                  <div className="flex justify-between"><span className="text-[var(--uc-warm-gray)]">Phone</span><span className="font-semibold text-[var(--uc-ink)]">{openBlock.booking.contactNumber}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--uc-warm-gray)]">Platform</span><span className="font-semibold text-[var(--uc-ink)]">{PLATFORM_LABEL[openBlock.booking.platform] ?? openBlock.booking.platform}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--uc-warm-gray)]">Check-in / out</span><span className="font-semibold text-[var(--uc-ink)]">{fmtTimeStr(openBlock.booking.checkInTime) ?? "—"} / {fmtTimeStr(openBlock.booking.checkOutTime) ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--uc-warm-gray)]">Guests</span><span className="font-semibold text-[var(--uc-ink)]">{openBlock.booking.pax ?? "—"}</span></div>
                  <div className="flex justify-between">
                    <span className="text-[var(--uc-warm-gray)]">Payment</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: openBlock.booking.paid ? STATUS_COLOR.paid : STATUS_COLOR.pending }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: openBlock.booking.paid ? STATUS_COLOR.paid : STATUS_COLOR.pending }} />
                      {openBlock.booking.paid ? "Paid" : "Pending"} · {peso(openBlock.booking.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-[var(--uc-warm-gray)]">Booker</span><span className="font-semibold text-[var(--uc-ink)]">{openBlock.booking.booker?.name ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--uc-warm-gray)]">Cleaner</span><span className="font-semibold text-[var(--uc-ink)]">{openBlock.booking.cleaner?.name ?? "—"}</span></div>
                  {canRevealAccessCode && STAY_TYPE_KEYS.includes(openBlock.type) && (
                    <DoorCodeReveal key={openBlock.booking.id} bookingId={openBlock.booking.id} accentClassName="text-[var(--uc-gold)]" guestName={openBlock.guest ?? undefined} canGenerateLink={canGenerateAccessLink && openBlock.booking.platform !== "Airbnb"} />
                  )}
                </>
              )}
              {openBlock.note && <div className="rounded-xl bg-[var(--uc-gold-10)] p-2.5 text-[var(--uc-ink)]">{openBlock.note}</div>}
            </div>

            {openBlock.booking?.confirmationNumber && (
              <Link
                href={`/bookings?search=${encodeURIComponent(openBlock.booking.confirmationNumber)}`}
                className="mt-5 flex items-center justify-center rounded-full bg-[var(--uc-charcoal)] px-4 py-3 text-[13.5px] font-bold text-white transition hover:opacity-90"
              >
                View Full Booking →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Drag-to-reschedule confirmation — never a silent commit */}
      {pendingMove && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => !moving && setPendingMove(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-[380px] rounded-[24px] border border-[var(--uc-line)] bg-[var(--uc-card)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[17px] text-[var(--uc-ink)]">Move this stay?</h3>
            <p className="mt-2 text-[13.5px] text-[var(--uc-warm-gray)]">
              {pendingMove.block.guest ?? "This guest"}&rsquo;s stay moves to{" "}
              <span className="font-semibold text-[var(--uc-ink)]">
                {isoDate(pendingMove.newDate)}{pendingMove.newCheckOutDate ? ` → ${isoDate(pendingMove.newCheckOutDate)}` : ""}
              </span>.
            </p>
            {moveError && <p className="mt-2 rounded-lg bg-rausch/10 px-2.5 py-2 text-[12.5px] font-semibold text-rausch">{moveError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingMove(null)} disabled={moving} className="rounded-full border border-[var(--uc-line)] px-4 py-2 text-[13px] font-bold text-[var(--uc-ink)] disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmMove} disabled={moving} className="rounded-full bg-[var(--uc-gold)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                {moving ? "Moving…" : "Move stay"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right-click quick actions */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-[60] w-[220px] overflow-hidden rounded-2xl border border-[var(--uc-line)] bg-[var(--uc-card)] py-1.5 shadow-[0_16px_40px_rgba(28,26,23,.18)]"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 232), top: Math.min(contextMenu.y, window.innerHeight - 160) }}
          >
            <div className="px-3.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--uc-warm-gray)]">
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(contextMenu.day)}
            </div>
            {contextMenu.onDay.length === 0 ? (
              <>
                <button
                  onClick={() => { router.push(`/bookings?prefillUnit=${unit.id}&prefillDate=${isoDate(contextMenu.day)}&prefillStayType=Full`); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-semibold text-[var(--uc-ink)] hover:bg-[var(--uc-gold-10)]"
                >
                  + Add booking
                </button>
                <button
                  onClick={() => blockForMaintenance(contextMenu.day)}
                  disabled={blockingMaintenance}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-semibold text-[var(--uc-ink)] hover:bg-[var(--uc-gold-10)] disabled:opacity-50"
                >
                  🔧 {blockingMaintenance ? "Blocking…" : "Block for maintenance"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { const b = contextMenu.onDay.find((x) => STAY_TYPE_KEYS.includes(x.type)) ?? contextMenu.onDay[0]; setOpenBlock(b); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-semibold text-[var(--uc-ink)] hover:bg-[var(--uc-gold-10)]"
                >
                  View details
                </button>
                {contextMenu.onDay.filter((b) => b.type === "Maintenance" && !b.booking).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => removeBlock(b.id)}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-semibold text-rausch hover:bg-rausch/5"
                  >
                    🗑 Remove maintenance block
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
