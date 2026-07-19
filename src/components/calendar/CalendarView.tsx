"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { ArrowLeftIcon, ArrowRightIcon, FilterIcon, SearchIcon, RefreshIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { fmtDate, fmtTimeStr, unitLabel, peso } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { nightsFor } from "@/lib/stayRange";
import { canManageUnits } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; unitNumber: string; shortName: string; nightlyRate?: number; icalImportUrl?: string | null; owners?: { user: { name: string } }[] };
type BlockBooking = {
  platform: string; amount: number; paid: boolean; dpAmount: number | null;
  checkInTime: string | null; checkOutTime: string | null; pax: number | null; contactNumber: string;
  method: string | null; dpMethod: string | null;
  booker: { name: string } | null; cleaner: { name: string } | null;
} | null;
type Block = { id: string; unitId: string; unit: Unit; type: string; date: string; endDate: string | null; guest: string | null; note: string | null; status: string; booking?: BlockBooking };

const TYPE_META: Record<string, { label: string; color: string; icon: string; textColor?: string }> = {
  Full: { label: "21-Hour", color: "#3B71E8", icon: "🛏️" },
  Night: { label: "Night stay", color: "#7C5CE7", icon: "🌙" },
  Daycation: { label: "Daycation", color: "#0D9E6E", icon: "☀️" },
  Cleaning: { label: "Cleaning", color: "#8E99AA", icon: "🧹" },
  Maintenance: { label: "Maintenance", color: "#C87D00", icon: "🔧" },
};

const PLATFORM_ICON: Record<string, string> = { Airbnb: "🏠", TikTok: "🎵", Facebook: "📘", WalkIn: "🚶", Direct: "📞", Other: "🌐" };

// Airbnb bookings get their own dedicated tile color — rausch, the app's
// brand red (itself Airbnb's own "Rausch" brand color) — instead of the
// stay-type color, so the platform that drives most of the business is
// recognizable across the grid at a glance. Airbnb has no day-use product,
// so every Airbnb booking is a Full (21-Hour) stay (enforced in BookingForm
// and server-side in normalizeStayTypeForPlatform) — this color always
// means "Full", never mixed with the Daycation/Night colors.
const AIRBNB_COLOR = "#FF385C";

// Day-column width and the height of one occupancy "lane" within a unit's
// row — a slim, timeline-style density (closer to a Gantt chart) so a full
// month plus every unit fits on one screen with little or no scrolling,
// rather than needing to scroll to see units below the fold. Tile content
// is deliberately terse at this size (guest name + one summary line) —
// full detail is one click away in the read-only modal.
const CELL_W = 40;
const LANE_H = 52;
const SIDEBAR_W = 200;

// Business runs in Manila (UTC+8), but this component renders on both a
// UTC server and a Manila (or browser-local) client. Every date below is
// represented as a UTC-midnight instant standing in for a Manila calendar
// day (matching how Booking.date is stored), and read back out with UTC
// getters/timeZone:"UTC" formatting — never local getters — so server and
// client always agree, avoiding hydration mismatches and the one-day-shift
// bug this exact pattern caused before.
function manilaToday() {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${iso}T00:00:00Z`);
}
function fmtDay2(d: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
}
function isoDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Read-only occupancy overview — the Bookings page is the single place to
// create/edit/cancel a reservation, so tiles here open a read-only detail
// view, never an editable form (no click-to-add, no click-to-edit), avoiding
// two divergent paths to the same data.
export function CalendarView({ role, units, initialBlocks }: { role: string; units: Unit[]; initialBlocks: Block[] }) {
  const blocks = initialBlocks;
  const router = useRouter();
  const toast = useToast();
  const canSync = canManageUnits(role as any);
  const [syncing, setSyncing] = useState(false);
  const unitsWithAirbnbFeed = useMemo(() => units.filter((u) => u.icalImportUrl), [units]);

  async function syncAll() {
    setSyncing(true);
    try {
      const res = await fetch("/api/ical/sync-all", { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) {
        toast("Couldn't sync Airbnb calendars — try again.", true);
        return;
      }
      const totalImported = j.results.reduce((s: number, r: any) => s + (r.imported ?? 0), 0);
      const totalUpdated = j.results.reduce((s: number, r: any) => s + (r.updated ?? 0), 0);
      const totalRemoved = j.results.reduce((s: number, r: any) => s + (r.removed ?? 0), 0);
      const failed = j.results.filter((r: any) => !r.ok);
      if (failed.length > 0) {
        toast(`Synced ${j.synced - failed.length}/${j.synced} units — ${failed.length} failed. Check Admin → Units.`, true);
      } else {
        toast(`Synced ${j.synced} unit${j.synced === 1 ? "" : "s"} — ${totalImported} new, ${totalUpdated} updated, ${totalRemoved} removed ✓`);
      }
      router.refresh();
    } catch {
      toast("Couldn't reach the server — check your connection and try again.", true);
    } finally {
      setSyncing(false);
    }
  }

  const [anchor, setAnchor] = useState(() => manilaToday());
  const [selected, setSelected] = useState<Block | null>(null);

  // Filters — search by guest name, narrow to specific units/platforms/paid
  // status. All default to "everything visible" so the calendar behaves
  // exactly as before until someone opens Filters.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState<Set<string> | null>(null); // null = all units
  const [platformFilter, setPlatformFilter] = useState<Set<string> | null>(null); // null = all platforms
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const jumpInputRef = useRef<HTMLInputElement | null>(null);

  const activeFilterCount =
    (search.trim() ? 1 : 0) + (unitFilter ? 1 : 0) + (platformFilter ? 1 : 0) + (paidFilter !== "all" ? 1 : 0);

  function resetFilters() {
    setSearch("");
    setUnitFilter(null);
    setPlatformFilter(null);
    setPaidFilter("all");
  }

  function toggleInSet(set: Set<string> | null, all: string[], value: string): Set<string> | null {
    const current = set ?? new Set(all);
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    // Selecting everything is the same as no filter — collapse back to null
    // so the UI doesn't show an active-filter count for a no-op selection.
    if (next.size === all.length) return null;
    if (next.size === 0) return next; // explicit "show nothing" is a valid, if unusual, state
    return next;
  }

  const visibleUnits = useMemo(
    () => (unitFilter ? units.filter((u) => unitFilter.has(u.id)) : units),
    [units, unitFilter]
  );

  const filteredBlocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return blocks.filter((b) => {
      if (unitFilter && !unitFilter.has(b.unitId)) return false;
      if (platformFilter && (!b.booking || !platformFilter.has(b.booking.platform))) return false;
      if (paidFilter !== "all" && (!b.booking || b.booking.paid !== (paidFilter === "paid"))) return false;
      if (q && !(b.guest ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [blocks, unitFilter, platformFilter, paidFilter, search]);

  // Global keyboard shortcuts (only when not typing into a field elsewhere
  // on the page): ←/→ change month, T jumps to today, / focuses search.
  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      const tag = (el as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement | null)?.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") { setAnchor((a) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1))); }
      else if (e.key === "ArrowRight") { setAnchor((a) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1))); }
      else if (e.key === "t" || e.key === "T") { setAnchor(manilaToday()); }
      else if (e.key === "/") { e.preventDefault(); setFiltersOpen(true); requestAnimationFrame(() => searchInputRef.current?.focus()); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const days = useMemo(() => {
    const y = anchor.getUTCFullYear(), m = anchor.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => new Date(Date.UTC(y, m, i + 1)));
  }, [anchor]);

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(anchor);
  const todayIso = isoDate(new Date());

  // Bring today's column into view on load (and whenever "Today" is pressed)
  // — the month grid can be wider than the viewport, so without this it
  // silently opens scrolled to day 1 instead of where the action actually is.
  const todayColRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    todayColRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [anchor]);

  // One continuous bar per booking, positioned across the day-columns it
  // spans rather than a separate tile per day — assigns each unit's blocks
  // to the smallest number of stacked "lanes" needed (almost always 1). The
  // one case that legitimately shares a single day — a Daycation (morning)
  // and a Night stay (evening) — isn't a real overlap, so instead of eating
  // a whole extra lane it splits one lane top/bottom, each getting half the
  // height, since they represent different times of the same day rather
  // than two rooms' worth of stacked occupancy.
  type Bar = { block: Block; startIdx: number; span: number; lane: number; isTrueStart: boolean; isTrueEnd: boolean; half: "full" | "top" | "bottom" };
  const barsByUnit = useMemo(() => {
    const dayIsos = days.map(isoDate);
    const firstIso = dayIsos[0], lastIso = dayIsos[dayIsos.length - 1];
    const map = new Map<string, Bar[]>();
    for (const u of visibleUnits) {
      const unitBlocks = filteredBlocks
        .filter((b) => b.unitId === u.id)
        .map((b) => ({ block: b, start: b.date.slice(0, 10), end: (b.endDate ?? b.date).slice(0, 10) }))
        .filter((b) => b.end >= firstIso && b.start <= lastIso)
        .sort((a, b) => a.start.localeCompare(b.start));

      const sameDayGroups = new Map<string, typeof unitBlocks>();
      for (const b of unitBlocks) {
        if (b.start !== b.end) continue;
        if (!sameDayGroups.has(b.start)) sameDayGroups.set(b.start, []);
        sameDayGroups.get(b.start)!.push(b);
      }

      const laneEnds: string[] = [];
      const bars: Bar[] = [];
      const placed = new Set<string>();
      for (const b of unitBlocks) {
        if (placed.has(b.block.id)) continue;

        const group = b.start === b.end ? sameDayGroups.get(b.start) : undefined;
        const isDayNightPair = group?.length === 2 && group.some((g) => g.block.type === "Daycation") && group.some((g) => g.block.type === "Night");

        let lane = laneEnds.findIndex((end) => end < b.start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.end); }
        else laneEnds[lane] = b.end;

        const visStart = b.start < firstIso ? firstIso : b.start;
        const visEnd = b.end > lastIso ? lastIso : b.end;
        const startIdx = dayIsos.indexOf(visStart);
        const endIdx = dayIsos.indexOf(visEnd);
        const common = { startIdx, span: endIdx - startIdx + 1, lane, isTrueStart: visStart === b.start, isTrueEnd: visEnd === b.end };

        if (isDayNightPair) {
          const dayHalf = group!.find((g) => g.block.type === "Daycation")!;
          const nightHalf = group!.find((g) => g.block.type === "Night")!;
          bars.push({ block: dayHalf.block, ...common, half: "top" });
          bars.push({ block: nightHalf.block, ...common, half: "bottom" });
          placed.add(dayHalf.block.id);
          placed.add(nightHalf.block.id);
        } else {
          bars.push({ block: b.block, ...common, half: "full" });
          placed.add(b.block.id);
        }
      }
      map.set(u.id, bars);
    }
    return map;
  }, [filteredBlocks, visibleUnits, days]);
  const lanesForUnit = (unitId: string) => Math.max(1, ...(barsByUnit.get(unitId) ?? []).map((b) => b.lane + 1));

  // Daycation / Night-stay counts for this unit within the visible month —
  // shown beside the unit info so each row's mix is visible without scanning.
  const monthTypeCounts = useMemo(() => {
    const dayIsos = new Set(days.map(isoDate));
    const counts = new Map<string, { Daycation: number; Night: number }>();
    for (const b of filteredBlocks) {
      if (!dayIsos.has(b.date.slice(0, 10))) continue;
      if (b.type !== "Daycation" && b.type !== "Night") continue;
      const c = counts.get(b.unitId) ?? { Daycation: 0, Night: 0 };
      c[b.type as "Daycation" | "Night"]++;
      counts.set(b.unitId, c);
    }
    return counts;
  }, [filteredBlocks, days]);

  const upcoming = useMemo(() => {
    const startOfToday = manilaToday();
    return filteredBlocks
      .filter((b) => TYPE_META[b.type] && (b.type === "Full" || b.type === "Night" || b.type === "Daycation") && new Date(b.date) >= startOfToday)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .slice(0, 6);
  }, [filteredBlocks]);

  const todayCount = filteredBlocks.filter((b) => b.date.slice(0, 10) === todayIso && b.type !== "Cleaning" && b.type !== "Maintenance").length;
  const occupiedUnits = new Set(filteredBlocks.filter((b) => b.date.slice(0, 10) === todayIso).map((b) => b.unitId)).size;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-9 sm:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Availability Calendar</h1>
          <p className="mt-1 text-[13px] text-[var(--gray)]">
            {visibleUnits.length === units.length ? `${units.length} units` : `${visibleUnits.length} of ${units.length} units`} · read-only occupancy overview — log or edit bookings from the Bookings page
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn("btn btn-sm", filtersOpen && "border-[var(--ink)]")}
            aria-expanded={filtersOpen}
          >
            <FilterIcon className="h-3.5 w-3.5" /> Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => setAnchor((a) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1)))}
              className="btn-icon !h-9 !w-9"
              aria-label="Previous month"
              title="Previous month (←)"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => jumpInputRef.current?.showPicker?.() ?? jumpInputRef.current?.click()}
              className="min-w-[150px] rounded-lg px-2 py-1 text-center text-[14.5px] font-extrabold hover:bg-[var(--bg-2)]"
              aria-label="Jump to month"
              title="Click to jump to a specific month"
            >
              {monthLabel}
            </button>
            <input
              ref={jumpInputRef}
              type="month"
              className="pointer-events-none absolute inset-0 h-9 w-full opacity-0"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m] = e.target.value.split("-").map(Number);
                setAnchor(new Date(Date.UTC(y, m - 1, 1)));
              }}
            />
            <button
              onClick={() => setAnchor((a) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1)))}
              className="btn-icon !h-9 !w-9"
              aria-label="Next month"
              title="Next month (→)"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setAnchor(manilaToday())} className="btn btn-sm" title="Jump to today (T)">Today</button>
          {canSync && unitsWithAirbnbFeed.length > 0 && (
            <button
              onClick={syncAll}
              disabled={syncing}
              className="btn btn-sm disabled:opacity-60"
              title={`Pull live Airbnb reservations for ${unitsWithAirbnbFeed.length} unit${unitsWithAirbnbFeed.length === 1 ? "" : "s"}`}
            >
              <RefreshIcon className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : `Sync Airbnb (${unitsWithAirbnbFeed.length})`}
            </button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
          <div className="mb-3.5">
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Search guest</div>
            <div className="relative max-w-[280px]">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gray)]" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Guest name… (press / to focus)"
                className="field-input py-2 pl-8 text-[13px]"
              />
            </div>
          </div>

          <div className="mb-3.5">
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Units</div>
            <div className="flex flex-wrap gap-1.5">
              {units.map((u) => (
                <Pill key={u.id} on={!unitFilter || unitFilter.has(u.id)} onClick={() => setUnitFilter((prev) => toggleInSet(prev, units.map((x) => x.id), u.id))}>
                  {u.unitNumber} · {u.shortName}
                </Pill>
              ))}
            </div>
          </div>

          <div className="mb-3.5">
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Platform</div>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <Pill key={p} on={!platformFilter || platformFilter.has(p)} onClick={() => setPlatformFilter((prev) => toggleInSet(prev, [...PLATFORMS], p))}>
                  {PLATFORM_ICON[p]} {PLATFORM_LABEL[p] ?? p}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Payment status</div>
            <div className="flex flex-wrap gap-1.5">
              <Pill on={paidFilter === "all"} onClick={() => setPaidFilter("all")}>All</Pill>
              <Pill on={paidFilter === "paid"} onClick={() => setPaidFilter("paid")}>Paid</Pill>
              <Pill on={paidFilter === "unpaid"} onClick={() => setPaidFilter("unpaid")}>Unpaid</Pill>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3.5">
            <button onClick={resetFilters} disabled={activeFilterCount === 0} className="text-[13px] font-bold text-[var(--gray)] hover:text-[var(--ink)] disabled:opacity-40">Reset filters</button>
            <button onClick={() => setFiltersOpen(false)} className="btn-primary btn-sm">Done</button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-[12px] font-semibold text-[var(--gray)]">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Legend</span>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />{m.icon} {m.label}</span>
        ))}
        <span className="h-4 w-px bg-[var(--line)]" />
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AIRBNB_COLOR }} />🏠 Airbnb (always 21-Hour)</span>
        <span className="h-4 w-px bg-[var(--line)]" />
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green" />Paid</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" />Unpaid</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: days.length * CELL_W + SIDEBAR_W }}>
              <div className="flex border-b-2 border-[var(--line)]">
                <div className="sticky left-0 z-10 flex-none border-r border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]" style={{ width: SIDEBAR_W }}>Unit</div>
                {days.map((d) => (
                  <div
                    key={+d}
                    ref={isoDate(d) === todayIso ? todayColRef : undefined}
                    className={cn("flex-none border-l border-[var(--line)] py-1 text-center", (d.getUTCDay() === 0 || d.getUTCDay() === 6) && "bg-[var(--bg-2)]", isoDate(d) === todayIso && "border-l-2 border-l-rausch bg-rausch/5")}
                    style={{ width: CELL_W }}
                  >
                    <div className="text-[8.5px] font-bold uppercase text-[var(--gray)]">{fmtDay2(d)}</div>
                    <div className={cn("text-[12px] font-extrabold", isoDate(d) === todayIso && "text-rausch")}>{d.getUTCDate()}</div>
                  </div>
                ))}
              </div>

              {visibleUnits.length === 0 && (
                <div className="p-10 text-center text-[13.5px] text-[var(--gray)]">No units match the current filters. <button onClick={resetFilters} className="font-bold text-rausch hover:underline">Reset filters</button></div>
              )}
              {visibleUnits.map((u) => {
                const typeCounts = monthTypeCounts.get(u.id) ?? { Daycation: 0, Night: 0 };
                const rowHeight = lanesForUnit(u.id) * LANE_H;
                return (
                <div key={u.id} className="flex border-b border-[var(--line)] last:border-0" style={{ minHeight: rowHeight }}>
                  <div
                    className="sticky left-0 z-10 flex flex-none flex-col items-start justify-center gap-1.5 border-r border-[var(--line)] bg-[var(--card)] px-3 py-2"
                    style={{ width: SIDEBAR_W }}
                    title={`Unit ${u.unitNumber} · ${u.shortName} · Owner: ${u.owners?.length ? u.owners.map((o) => o.user.name).join(", ") : "Owner/Admin"}`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="flex-none rounded bg-rausch/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-rausch">{u.unitNumber}</span>
                      <span className="truncate text-[13px] font-extrabold leading-tight">{u.shortName}</span>
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      <span className="rounded px-1.5 py-0.5 text-[10.5px] font-extrabold whitespace-nowrap" style={{ background: `${TYPE_META.Daycation.color}1A`, color: TYPE_META.Daycation.color }}>
                        ☀️ {typeCounts.Daycation}
                      </span>
                      <span className="rounded px-1.5 py-0.5 text-[10.5px] font-extrabold whitespace-nowrap" style={{ background: `${TYPE_META.Night.color}1A`, color: TYPE_META.Night.color }}>
                        🌙 {typeCounts.Night}
                      </span>
                    </div>
                  </div>
                  <div className="relative flex flex-1">
                    {days.map((d) => (
                      <div
                        key={+d}
                        className={cn("flex-none border-l border-[var(--line)]", (d.getUTCDay() === 0 || d.getUTCDay() === 6) && "bg-[var(--bg-2)]", isoDate(d) === todayIso && "bg-rausch/5")}
                        style={{ width: CELL_W }}
                      />
                    ))}
                    <div className="pointer-events-none absolute inset-0">
                      {(barsByUnit.get(u.id) ?? []).map((bar) => {
                        const b = bar.block;
                        const meta = TYPE_META[b.type];
                        const isAirbnb = b.booking?.platform === "Airbnb";
                        const tileColor = isAirbnb ? AIRBNB_COLOR : meta?.color ?? "#999";
                        const isDaycation = b.type === "Daycation";
                        const isHalf = bar.half !== "full";
                        const nights = b.booking && !isDaycation ? nightsFor(b.type, new Date(b.date), b.endDate ? new Date(b.endDate) : null) : 0;
                        const barHeight = isHalf ? LANE_H / 2 - 7 : LANE_H - 10;
                        const barTop = bar.lane * LANE_H + (bar.half === "bottom" ? LANE_H / 2 : 0) + 5;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelected(b); }}
                            title={`${b.guest ?? meta?.label ?? b.type}${b.note ? ` — ${b.note}` : ""}${b.booking ? ` — ${b.booking.paid ? "Paid" : "Unpaid"}` : ""} — click for details`}
                            aria-label={`${b.guest ?? meta?.label ?? b.type}, ${meta?.label ?? b.type}${b.booking ? `, ${b.booking.paid ? "paid" : "unpaid"}` : ""}, click for details`}
                            className={cn(
                              "pointer-events-auto absolute flex cursor-pointer flex-col justify-center gap-px overflow-hidden px-1.5 text-left text-white shadow-s transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]",
                              bar.isTrueStart && "rounded-l-md",
                              bar.isTrueEnd && "rounded-r-md"
                            )}
                            style={{
                              left: bar.startIdx * CELL_W + 1,
                              width: bar.span * CELL_W - 2,
                              top: barTop,
                              height: barHeight,
                              background: tileColor,
                            }}
                          >
                            {b.booking && (
                              <span
                                className={cn("absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-1 ring-white/70", b.booking.paid ? "bg-green" : "bg-amber")}
                                aria-hidden="true"
                              />
                            )}
                            <div className={cn("flex w-full items-center gap-1 truncate font-extrabold leading-tight", isHalf ? "text-[9.5px]" : "text-[11px]")}>
                              <span className="flex-none">{meta?.icon}</span>
                              {b.booking && !isHalf && <span className="flex-none">{PLATFORM_ICON[b.booking.platform]}</span>}
                              <span className="truncate">{b.guest || meta?.label || b.type}</span>
                            </div>
                            {b.booking && !isHalf && (
                              <div className="w-full truncate text-[9px] font-bold leading-tight opacity-90">
                                {isDaycation ? meta?.label : `${nights}n`} · {peso(b.booking.amount)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="card p-4">
            <h3 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Today at a glance</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 rounded-xl border border-rausch/20 bg-rausch/5 p-3"><div className="text-[22px] font-extrabold text-rausch">{todayCount}</div><div className="text-[11px] font-semibold text-[var(--gray)]">Check-ins today</div></div>
              <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-[22px] font-extrabold">{occupiedUnits}</div><div className="text-[11px] font-semibold text-[var(--gray)]">Occupied now</div></div>
              <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-[22px] font-extrabold">{Math.max(visibleUnits.length - occupiedUnits, 0)}</div><div className="text-[11px] font-semibold text-[var(--gray)]">Available</div></div>
            </div>
          </div>
          <div className="card p-4">
            <h3 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Upcoming check-ins</h3>
            {upcoming.length === 0 && <p className="text-[12px] text-[var(--gray)]">No upcoming check-ins.</p>}
            {upcoming.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelected(b)}
                className="flex w-full items-center gap-2.5 border-t border-[var(--line)] py-2.5 text-left first:border-0 hover:bg-[var(--bg-2)]"
              >
                <div className="w-[54px] text-[11px] font-extrabold">{fmtDate(b.date, { month: "short", day: "numeric" })}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold">{b.guest ?? "Guest"}</div>
                  <div className="truncate text-[10.5px] text-[var(--gray)]">{b.unit.shortName} · {TYPE_META[b.type]?.label}</div>
                </div>
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: TYPE_META[b.type]?.color }} />
              </button>
            ))}
          </div>
        </aside>
      </div>

      {selected && <BookingDetailModal block={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function BookingDetailModal({ block: b, onClose }: { block: Block; onClose: () => void }) {
  const meta = TYPE_META[b.type];
  const isAirbnb = b.booking?.platform === "Airbnb";
  const isDaycation = b.type === "Daycation";
  const nights = !isDaycation ? nightsFor(b.type, new Date(b.date), b.endDate ? new Date(b.endDate) : null) : 0;
  const bk = b.booking;

  return (
    <Modal open onClose={onClose} title={b.guest ?? meta?.label ?? b.type} sub={unitLabel(b.unit)} maxWidth={440}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white" style={{ background: isAirbnb ? AIRBNB_COLOR : meta?.color ?? "#999" }}>
            {meta?.icon} {meta?.label ?? b.type}
          </span>
          {bk && (
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-extrabold", isAirbnb ? "text-white" : "bg-[var(--bg-2)]")} style={isAirbnb ? { background: AIRBNB_COLOR } : undefined}>
              {PLATFORM_ICON[bk.platform] ?? ""} {PLATFORM_LABEL[bk.platform] ?? bk.platform}
            </span>
          )}
          {bk && (
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-extrabold", bk.paid ? "bg-green/15 text-green" : "bg-amber/15 text-amber")}>
              {bk.paid ? "Paid" : "Unpaid"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13.5px]">
          <div>
            <div className="text-[11px] font-bold text-[var(--gray)]">Check-in</div>
            <div className="font-extrabold">{fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}{bk?.checkInTime && ` · ${fmtTimeStr(bk.checkInTime)}`}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-[var(--gray)]">Check-out</div>
            <div className="font-extrabold">
              {b.endDate ? fmtDate(b.endDate, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : isDaycation ? fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}
              {bk?.checkOutTime && ` · ${fmtTimeStr(bk.checkOutTime)}`}
            </div>
          </div>
          {!isDaycation && (
            <div>
              <div className="text-[11px] font-bold text-[var(--gray)]">Duration</div>
              <div className="font-extrabold">{nights} night{nights !== 1 ? "s" : ""}</div>
            </div>
          )}
          {bk?.pax != null && (
            <div>
              <div className="text-[11px] font-bold text-[var(--gray)]">Guests</div>
              <div className="font-extrabold">{bk.pax}</div>
            </div>
          )}
          {bk && (
            <div>
              <div className="text-[11px] font-bold text-[var(--gray)]">Revenue</div>
              <div className="font-extrabold">{peso(bk.amount)}</div>
            </div>
          )}
          {bk?.contactNumber && (
            <div>
              <div className="text-[11px] font-bold text-[var(--gray)]">Contact</div>
              <div className="font-extrabold">{bk.contactNumber}</div>
            </div>
          )}
          {bk?.booker?.name && (
            <div>
              <div className="text-[11px] font-bold text-[var(--gray)]">Booker</div>
              <div className="font-extrabold">{bk.booker.name}</div>
            </div>
          )}
          {bk?.cleaner?.name && (
            <div>
              <div className="text-[11px] font-bold text-[var(--gray)]">Cleaner</div>
              <div className="font-extrabold">{bk.cleaner.name}</div>
            </div>
          )}
          {bk?.method && (
            <div>
              <div className="text-[11px] font-bold text-[var(--gray)]">Payment method</div>
              <div className="font-extrabold">{PAYMENT_METHOD_LABEL[bk.method] ?? bk.method}</div>
            </div>
          )}
        </div>

        {b.note && (
          <div>
            <div className="text-[11px] font-bold text-[var(--gray)]">Note</div>
            <div className="text-[13.5px]">{b.note}</div>
          </div>
        )}

        <p className="border-t border-[var(--line)] pt-3 text-[12px] text-[var(--gray)]">Read-only — edit or cancel this booking from the Bookings page.</p>
      </div>
    </Modal>
  );
}
