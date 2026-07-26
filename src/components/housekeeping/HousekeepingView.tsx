"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { fmtDate, fmtTime, fmtTimeStr, formatUnitDisplay } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { canEditHousekeeping, canAddHousekeepingStock } from "@/lib/rbac";
import { fetchOrQueue } from "@/lib/offlineQueue";
import { cn } from "@/lib/utils";
import { RoomCard } from "./RoomCard";
import { StockPanel } from "./StockPanel";
import { BillsPanel } from "./BillsPanel";
import { LaundryPanel } from "./laundry/LaundryPanel";

// Business runs in Manila (UTC+8), but this component renders both on the
// server (Vercel functions run in UTC) and the client (browser's local
// time). Naive local-getter date comparisons (toDateString, getMonth, etc.)
// would disagree between the two whenever it's a different calendar day in
// UTC than in Manila, causing a hydration mismatch on first paint — bucket
// by the Manila calendar date explicitly instead, everywhere.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

type Unit = { id: string; name: string; shortName: string; unitNumber: string };
type HkState = { id?: string; unitId: string; status: string; byName: string | null; checked: boolean[][]; startedAt?: string | null; endedAt?: string | null; cleanedBookingIds?: string[] };
type Log = { id: string; unitId: string; unit: { shortName: string; unitNumber?: string }; startedAt: string; endedAt: string | null };
type Stock = { id: string; unitId: string; name: string; count: number };
type Bill = any;
type Shift = { id: string; clockIn: string; clockOut: string | null } | null;
type OpenShift = { id: string; clockIn: string; user: { id: string; name: string } };
type ChecklistGroup = { name: string; optional?: boolean; items: string[]; unitIds?: string[] };
type ScheduleBooking = {
  id: string; unitId: string; date: string; checkOutDate: string | null; checkOutTime: string | null; stayType: string; guests: string[];
  unit: Unit; cleaner: { id: string; name: string } | null;
};

export function HousekeepingView({
  role, units, initialStates, initialLogs, initialStocks, employees, initialShift, initialBills, checklistGroups, upcomingBookings = [], housekeepingOpenShifts = [],
}: {
  role: string;
  units: Unit[];
  initialStates: HkState[];
  initialLogs: Log[];
  initialStocks: Stock[];
  employees: { id: string; name: string; role: string; userId?: string | null }[];
  initialShift: Shift;
  initialBills: Bill[];
  checklistGroups: ChecklistGroup[];
  upcomingBookings?: ScheduleBooking[];
  housekeepingOpenShifts?: OpenShift[];
}) {
  const { data: session } = useSession();
  const toast = useToast();
  const [states, setStates] = useState(initialStates);
  const [logs, setLogs] = useState(initialLogs);
  const [stocks, setStocks] = useState(initialStocks);
  const [bills, setBills] = useState(initialBills);
  const [shift, setShift] = useState(initialShift);
  const [showLogs, setShowLogs] = useState(true);
  const [scheduleTab, setScheduleTab] = useState<"today" | "tomorrow" | "week">("today");
  const canEdit = canEditHousekeeping(role as any);
  const canAddStock = canAddHousekeepingStock(role as any);
  const userName = session?.user?.name ?? "";
  // Clocking in/out is a Housekeeping-only action — Owner/Admin can still
  // edit rooms/checklists/supplies (that's what canEdit above gates), but
  // clocking in themselves would corrupt "who's actually on duty".
  const isHousekeepingStaff = role === "HOUSEKEEPING";
  // For every other role, "on duty" means the whole Housekeeping roster's
  // real clock state — not just whichever user happens to be viewing the
  // page, which for an Owner is never a real shift at all.
  const housekeepingRoster = useMemo(() => {
    const openByUserId = new Map(housekeepingOpenShifts.map((s) => [s.user.id, s]));
    return employees
      .filter((e) => e.role === "HOUSEKEEPING")
      .map((e) => ({ employee: e, openShift: e.userId ? openByUserId.get(e.userId) ?? null : null }))
      .sort((a, b) => (b.openShift ? 1 : 0) - (a.openShift ? 1 : 0) || a.employee.name.localeCompare(b.employee.name));
  }, [employees, housekeepingOpenShifts]);

  async function refreshHk() {
    const res = await fetch("/api/housekeeping");
    if (res.ok) {
      const j = await res.json();
      setStates(j.states);
      setLogs(j.logs);
    }
  }
  async function refreshStocks() {
    const res = await fetch("/api/housekeeping/stocks");
    if (res.ok) setStocks(await res.json());
  }
  async function refreshBills() {
    const res = await fetch("/api/housekeeping/bills");
    if (res.ok) setBills(await res.json());
  }

  async function updateUnit(unitId: string, patch: any) {
    setStates((prev) => {
      const idx = prev.findIndex((s) => s.unitId === unitId);
      // Mirrors the server's cleanedBookingIds bookkeeping (see the API
      // route) so the optimistic update doesn't flash a stale pending
      // checkout before refreshHk() lands.
      const optimistic = { ...patch };
      const prevIds = prev[idx]?.cleanedBookingIds ?? [];
      if (patch.status === "clean" && patch.end && patch.bookingId) {
        optimistic.cleanedBookingIds = prevIds.includes(patch.bookingId) ? prevIds : [...prevIds, patch.bookingId];
      }
      if (patch.status === "todo") { optimistic.cleanedBookingIds = []; optimistic.photoUrls = []; }
      const merged = { ...(prev[idx] ?? { unitId, status: "todo", byName: null, checked: [], photoUrls: [] }), ...optimistic };
      if (idx === -1) return [...prev, merged];
      const copy = [...prev];
      copy[idx] = merged;
      return copy;
    });
    // fetchOrQueue (not a plain fetch) — while offline this persists the
    // patch to IndexedDB and replays it once the connection comes back,
    // instead of just failing. The optimistic setStates() above already
    // reflects the change locally either way.
    const { queued } = await fetchOrQueue({
      url: `/api/housekeeping/unit/${unitId}`,
      method: "PATCH",
      bodyJson: patch,
      label: `Housekeeping update — ${unitId}`,
    });
    if (patch.status) {
      const base = patch.status === "clean" ? "Room marked clean ✓" : patch.status === "cleaning" ? "Cleaning started" : "Reset to to-do";
      toast(queued ? `${base} — will sync when back online` : base);
    }
    if (!queued) await refreshHk().catch(() => {});
  }

  async function clockIn() {
    const res = await fetch("/api/housekeeping/shift", { method: "POST" });
    if (res.ok) { setShift(await res.json()); toast("Clocked in ✅"); }
  }
  async function clockOut() {
    const res = await fetch("/api/housekeeping/shift", { method: "PATCH" });
    if (res.ok) { setShift(null); toast("Clocked out"); }
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const cleanedThisWeek = logs.filter((l) => new Date(l.startedAt) >= weekAgo).length;
  const todayIso = dayOf(new Date());
  const cleanedToday = logs.filter((l) => dayOf(new Date(l.startedAt)) === todayIso).length;

  const weekChart = useMemo(() => {
    // UTC-midnight representing "today" in Manila terms, then step backward
    // in UTC days — deterministic regardless of the runtime's own timezone,
    // unlike local getters (new Date().setDate(...)) which would disagree
    // between a UTC server and a Manila client.
    const todayManila = new Date(`${dayOf(new Date())}T00:00:00Z`);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayManila);
      d.setUTCDate(d.getUTCDate() - (6 - i));
      return d;
    });
    return days.map((d) => ({
      label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d),
      count: logs.filter((l) => dayOf(new Date(l.startedAt)) === dayOf(d)).length,
    }));
  }, [logs]);
  const maxCount = Math.max(1, ...weekChart.map((d) => d.count));

  const HK_STATUS_LABEL: Record<string, string> = { todo: "Pending", cleaning: "In progress", clean: "Completed" };
  const HK_STATUS_COLOR: Record<string, string> = { todo: "var(--gray)", cleaning: "var(--amber)", clean: "var(--green)" };

  // A room needs cleaning the moment a guest checks out — so the schedule is
  // driven by each booking's checkout day (checkOutDate for Night/Full,
  // same-day for Daycation), not by check-in, bucketed into Today / Tomorrow
  // / This week the same Manila-safe way every other date grouping on this
  // page already works.
  const schedule = useMemo(() => {
    const withCheckout = upcomingBookings.map((b) => ({ ...b, checkoutIso: (b.checkOutDate ?? b.date).slice(0, 10) }));
    const todayI = dayOf(new Date());
    const tomorrowD = new Date(`${todayI}T00:00:00Z`); tomorrowD.setUTCDate(tomorrowD.getUTCDate() + 1);
    const tomorrowI = dayOf(tomorrowD);
    const weekEndD = new Date(`${todayI}T00:00:00Z`); weekEndD.setUTCDate(weekEndD.getUTCDate() + 6);
    const weekEndI = dayOf(weekEndD);

    const byTime = (a: (typeof withCheckout)[number], b: (typeof withCheckout)[number]) =>
      a.checkoutIso.localeCompare(b.checkoutIso) || (a.checkOutTime ?? "99:99").localeCompare(b.checkOutTime ?? "99:99");

    return {
      today: withCheckout.filter((b) => b.checkoutIso === todayI).sort(byTime),
      tomorrow: withCheckout.filter((b) => b.checkoutIso === tomorrowI).sort(byTime),
      week: withCheckout.filter((b) => b.checkoutIso >= todayI && b.checkoutIso <= weekEndI).sort(byTime),
    };
  }, [upcomingBookings]);
  const scheduleList = schedule[scheduleTab];

  // A unit can have more than one checkout in a single day (e.g. a
  // Daycation guest leaving in the evening plus a separate Night booking
  // leaving that same day) — grouping today's checkouts per unit, in
  // checkout-time order, is what lets the rest of this component tell them
  // apart instead of treating "any checkout today" as one flat fact.
  const todaysCheckoutsByUnit = useMemo(() => {
    const map = new Map<string, typeof schedule.today>();
    for (const b of schedule.today) {
      if (!map.has(b.unitId)) map.set(b.unitId, []);
      map.get(b.unitId)!.push(b);
    }
    return map;
  }, [schedule]);
  function hasAnyCheckoutToday(unitId: string) {
    return (todaysCheckoutsByUnit.get(unitId)?.length ?? 0) > 0;
  }
  // The earliest of today's checkouts for this unit that hasn't been
  // cleaned for yet (per HousekeepingUnitState.cleanedBookingIds) — null
  // once every checkout that day has its own finished clean.
  function pendingBookingIdForUnit(unitId: string): string | null {
    const list = todaysCheckoutsByUnit.get(unitId);
    if (!list || list.length === 0) return null;
    const cleanedIds = states.find((s) => s.unitId === unitId)?.cleanedBookingIds ?? [];
    const pending = list.find((b) => !cleanedIds.includes(b.id));
    return pending?.id ?? null;
  }
  // A room defaults to Clean/ready — it only becomes "to clean" once a guest
  // has actually checked out of it today. Without that, a raw "todo" status
  // (e.g. a freshly-added unit that's never had a stored state) would
  // otherwise misrepresent an untouched room as needing work.
  function roomEffectiveStatus(unitId: string) {
    const raw = states.find((s) => s.unitId === unitId)?.status ?? "todo";
    const pending = pendingBookingIdForUnit(unitId);
    if (pending) return raw === "cleaning" ? "cleaning" : "todo";
    return raw === "todo" && !hasAnyCheckoutToday(unitId) ? "clean" : raw;
  }
  // Per-BOOKING status for the "Cleaning schedule" list below — two rows for
  // the same unit (e.g. its Night and Daycation checkouts today) can now
  // correctly show different statuses instead of sharing one unit-wide flag.
  function statusForBooking(booking: (typeof schedule.today)[number]) {
    const state = states.find((s) => s.unitId === booking.unitId);
    const cleanedIds = state?.cleanedBookingIds ?? [];
    if (cleanedIds.includes(booking.id)) return "clean";
    const pending = pendingBookingIdForUnit(booking.unitId);
    return pending === booking.id && state?.status === "cleaning" ? "cleaning" : "todo";
  }
  const todoCount = units.filter((u) => roomEffectiveStatus(u.id) === "todo").length;
  const cleaningCount = units.filter((u) => roomEffectiveStatus(u.id) === "cleaning").length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-9 sm:px-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Housekeeping</h1>
        <p className="mt-1 text-[14.5px] text-[var(--gray)]">Clock in, work through each room&rsquo;s checklist, keep supplies stocked, and track monthly bills.</p>
      </div>

      {isHousekeepingStaff ? (
        <div className="card mb-5 flex flex-wrap items-center gap-3.5 p-4">
          <span className={`h-2.5 w-2.5 rounded-full ${shift ? "bg-green shadow-[0_0_0_4px_rgba(0,138,5,.16)]" : "bg-[var(--gray)]"}`} />
          <div>
            <div className="text-[15px] font-extrabold">{shift ? `${userName} is on duty` : "No one on duty"}</div>
            <div className="text-[13px] text-[var(--gray)]">{shift ? `Clocked in at ${fmtTime(shift.clockIn)}` : "Clock in to start logging your cleaning."}</div>
          </div>
          <div className="ml-auto">
            {shift ? <button onClick={clockOut} className="btn">Clock out</button> : <button onClick={clockIn} className="btn" style={{ background: "#0B7C74", borderColor: "#0B7C74", color: "#fff" }}>Clock in</button>}
          </div>
        </div>
      ) : (
        <div className="card mb-5 p-4">
          <div className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Housekeeping status</div>
          {housekeepingRoster.length === 0 ? (
            <p className="text-[13.5px] text-[var(--gray)]">No Housekeeping staff on record.</p>
          ) : housekeepingRoster.every((r) => !r.openShift) ? (
            <p className="text-[14px] font-semibold text-[var(--gray)]">No one has clocked in from Housekeeping.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {housekeepingRoster.map((r) => (
                <div key={r.employee.id} className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 flex-none rounded-full ${r.openShift ? "bg-green shadow-[0_0_0_4px_rgba(0,138,5,.16)]" : "bg-[var(--gray)]"}`} />
                  <span className="text-[14px] font-extrabold">{r.employee.name}</span>
                  <span className="text-[13px] text-[var(--gray)]">{r.openShift ? `on duty since ${fmtTime(r.openShift.clockIn)}` : "off duty"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cleaned this week" value={cleanedThisWeek} sub="last 7 days" />
        <StatCard label="Cleaned today" value={cleanedToday} />
        <StatCard label="Rooms to clean" value={todoCount} sub={`${cleaningCount} in progress`} warn={todoCount > 0} />
        <StatCard label="Units" value={units.length} sub="total managed" />
      </div>

      <Accordion title="This week's cleans" sub="turnovers per day">
        <div className="flex h-[120px] items-end gap-2.5 pt-1.5">
          {weekChart.map((d, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="relative w-full max-w-[42px] rounded-t-lg bg-gradient-to-b from-teal to-[#0EA5A0]" style={{ height: `${Math.max(4, (d.count / maxCount) * 88)}px` }}>
                {d.count > 0 && <span className="absolute -top-5 left-0 right-0 text-center text-[12px] font-extrabold">{d.count}</span>}
              </div>
              <span className="text-[11px] font-bold text-[var(--gray)]">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-[var(--line)] pt-3">
          <button onClick={() => setShowLogs((v) => !v)} className="flex w-full items-center gap-2.5 py-2 text-left">
            <h3 className="text-[13px] font-extrabold">Recent cleaning log</h3>
            <span className="ml-auto text-[12px] font-semibold text-[var(--gray)]">{logs.length}</span>
            <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", showLogs && "rotate-180")} />
          </button>
          {showLogs && (
            <>
              {logs.slice(0, 8).map((l) => (
                <div key={l.id} className="flex items-center justify-between border-t border-[var(--line)] py-2.5 text-[13px] first:border-0">
                  <span className="font-bold">{formatUnitDisplay(l.unit.unitNumber, l.unit.shortName)}</span>
                  <span className="text-[var(--gray)]">{fmtDate(l.startedAt)} · {fmtTime(l.startedAt)}{l.endedAt ? `–${fmtTime(l.endedAt)}` : ""}</span>
                </div>
              ))}
              {logs.length === 0 && <p className="text-sm text-[var(--gray)]">No cleaning logged yet.</p>}
            </>
          )}
        </div>
      </Accordion>

      <Accordion title="Cleaning schedule" sub="by guest checkout">
        <div className="mb-4 inline-flex gap-1 rounded-full bg-[var(--bg-2)] p-1">
          {([["today", `Today (${schedule.today.length})`], ["tomorrow", `Tomorrow (${schedule.tomorrow.length})`], ["week", `This week (${schedule.week.length})`]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScheduleTab(key)}
              className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold transition", scheduleTab === key ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
            >
              {label}
            </button>
          ))}
        </div>

        {scheduleList.length === 0 ? (
          <p className="text-[13px] text-[var(--gray)]">No checkouts {scheduleTab === "today" ? "today" : scheduleTab === "tomorrow" ? "tomorrow" : "this week"}.</p>
        ) : (
          <div className="space-y-2.5">
            {scheduleList.map((b) => {
              const status = statusForBooking(b);
              const stayMeta = STAY_TYPES[b.stayType as keyof typeof STAY_TYPES];
              return (
                <div key={b.id} className="rounded-2xl border border-[var(--line)] p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-extrabold">{formatUnitDisplay(b.unit.unitNumber, b.unit.shortName)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-[var(--gray)]">{b.guests?.[0] ?? "Guest"} · {stayMeta?.label ?? b.stayType}</div>

                  {/* A full-width row above frees Checkout/Housekeeper/Status
                      to wrap on their own line instead of squeezing the unit
                      name and guest into an unreadably narrow sliver on
                      small screens (min-w-0 + flex-1 shrinks instead of
                      wrapping when there isn't room for everything). */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div>
                      <div className="text-[11px] font-bold text-[var(--gray)]">Checkout</div>
                      <div className="text-[13px] font-extrabold">
                        {scheduleTab === "week" ? fmtDate(b.checkoutIso, { month: "short", day: "numeric", timeZone: "UTC" }) : ""}
                        {scheduleTab === "week" && b.checkOutTime ? " · " : ""}
                        {b.checkOutTime ? fmtTimeStr(b.checkOutTime) : (scheduleTab !== "week" ? "—" : "")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-[var(--gray)]">Housekeeper</div>
                      <div className="text-[13px] font-extrabold">{b.cleaner?.name ?? "Unassigned"}</div>
                    </div>
                    <span
                      className="ml-auto flex-none rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                      style={{ background: `${HK_STATUS_COLOR[status]}1A`, color: HK_STATUS_COLOR[status] }}
                    >
                      {HK_STATUS_LABEL[status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Accordion>

      <Accordion title="Rooms" sub="tap a checklist item to tick it">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* For the person actually cleaning, today's pending rooms should
              be the first thing they see — everyone else (Owner/Admin/
              Co-owner) keeps the plain configured unit order, since they're
              scanning for an overview, not working through a task list. */}
          {(role === "HOUSEKEEPING"
            ? [...units].sort((a, b) => {
                const ap = pendingBookingIdForUnit(a.id) ? 0 : 1;
                const bp = pendingBookingIdForUnit(b.id) ? 0 : 1;
                return ap - bp;
              })
            : units
          ).map((u) => (
            <RoomCard
              key={u.id}
              unit={u}
              state={states.find((s) => s.unitId === u.id)}
              canEdit={canEdit}
              currentUserName={userName}
              onChange={updateUnit}
              checklistGroups={checklistGroups.filter((g) => !g.unitIds || g.unitIds.length === 0 || g.unitIds.includes(u.id))}
              pendingBookingId={pendingBookingIdForUnit(u.id)}
              hasAnyCheckoutToday={hasAnyCheckoutToday(u.id)}
            />
          ))}
        </div>
      </Accordion>

      <Accordion title="Supplies & stocks" sub="set the count per unit">
        <StockPanel units={units} stocks={stocks} canEdit={canEdit} canAdd={canAddStock} canDelete={false} onChanged={refreshStocks} />
      </Accordion>

      <Accordion title="💳 Bills tracker" sub="association dues, utilities & subscriptions">
        <BillsPanel units={units} bills={bills} canEdit={false} canTogglePaid={canEdit} onChanged={refreshBills} />
      </Accordion>

      <Accordion title="🧺 Laundry Management" sub="orders, services, payments & reports" defaultOpen={false}>
        <LaundryPanel role={role} units={units} />
      </Accordion>
    </div>
  );
}
