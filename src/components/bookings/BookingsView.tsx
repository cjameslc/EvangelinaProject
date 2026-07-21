"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { Tag } from "@/components/ui/Tag";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { EditIcon, TrashIcon, SearchIcon, UploadIcon, PlusIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { peso, fmtDate, fmtTime, fmtTimeStr } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABEL, PAYMENT_METHOD_LABEL, STAY_TYPES } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { canEditBookings, isReadOnlyFinancials } from "@/lib/rbac";
import { fetchOrQueue } from "@/lib/offlineQueue";
import { cn } from "@/lib/utils";
import { BookingForm, type BookingFormValue } from "./BookingForm";
import { BookingImportModal } from "./BookingImportModal";
import { AvailabilityChat } from "./AvailabilityChat";

type Employee = { id: string; name: string; role: string };
type Unit = { id: string; name: string; unitNumber: string; shortName: string; nightlyRate: number; owners?: { user: { name: string } }[] };
type Booking = {
  id: string; unitId: string; unit: Unit; date: string; checkOutDate: string | null; stayType: string;
  checkInTime: string | null; checkOutTime: string | null; guests: string[]; pax: number | null;
  contactNumber: string; bookerId: string | null; booker: Employee | null; cleanerId: string | null; cleaner: Employee | null;
  platform: string; platformOther: string | null;
  dpAmount: number | null; dpReceivedById: string | null; dpReceivedBy: Employee | null; dpMethod: string | null;
  amount: number; receivedById: string | null; receivedBy: Employee | null; method: string | null; paid: boolean;
  source?: string; conflict?: boolean;
  checkedInAt?: string | null; checkedOutAt?: string | null;
};
type HkState = { unitId: string; status: string };

// Business runs in Manila (UTC+8). Using toISOString() (UTC) to bucket days
// would put "today" a full calendar day behind during Philippine early-morning
// hours, when UTC is still on the previous day — so always bucket by the
// Manila calendar date instead of the server/runtime's own timezone.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Effective check-in/check-out day for a booking: explicit checkOutDate if
 * set, else the same-day (Daycation) / next-day (Night, Full) default. */
function effectiveRange(b: Booking) {
  const inDate = new Date(b.date);
  const outDate = b.checkOutDate ? new Date(b.checkOutDate) : new Date(inDate);
  if (!b.checkOutDate && b.stayType !== "Daycation") outDate.setDate(outDate.getDate() + 1);
  return { inIso: dayOf(inDate), outIso: dayOf(outDate) };
}

export function BookingsView({ role, units, employees, initialBookings, defaultDpFee, ownEmployeeId, hkStates = [] }: { role: string; units: Unit[]; employees: Employee[]; initialBookings: Booking[]; defaultDpFee: number; ownEmployeeId: string | null; hkStates?: HkState[] }) {
  const toast = useToast();
  const [bookings, setBookings] = useState(initialBookings);
  const [emps, setEmps] = useState(employees);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "3days" | "week" | "month">("week");
  const [importOpen, setImportOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<Partial<BookingFormValue> | null>(null);
  const [logAccordionKey, setLogAccordionKey] = useState(0);
  const [forceLogOpen, setForceLogOpen] = useState(false);

  // Availability chat's "Log this booking" hands off unitId/date/stayType
  // here — bumping the key forces the (uncontrolled) Accordion to remount
  // open even if it was already open from a previous suggestion, and the
  // BookingForm re-syncs from `initial` via its own effect either way.
  function handlePrefillBooking(v: { unitId: string; date: string; stayType: string }) {
    setBookingPrefill(v as Partial<BookingFormValue>);
    setLogAccordionKey((k) => k + 1);
    requestAnimationFrame(() => document.getElementById("log-new-booking-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // Always-visible "Add booking" entry point (same on mobile and desktop) —
  // the "Log new booking" accordion itself lives further down the page
  // below several other sections, which made it easy to miss on a small
  // screen; this jumps straight to it and force-opens it regardless of how
  // it was left before.
  function openAddBooking() {
    setForceLogOpen(true);
    setLogAccordionKey((k) => k + 1);
    requestAnimationFrame(() => document.getElementById("log-new-booking-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const canEdit = canEditBookings(role as any);
  const readOnly = isReadOnlyFinancials(role as any);

  async function refresh() {
    const res = await fetch("/api/bookings");
    if (res.ok) setBookings(await res.json());
    const eRes = await fetch("/api/employees");
    if (eRes.ok) setEmps(await eRes.json());
  }

  async function createBooking(v: BookingFormValue) {
    let res: Response;
    try {
      res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(v)),
      });
    } catch {
      toast("Couldn't reach the server — check your connection and try again.", true);
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.error ?? (res.status === 413 ? "That photo is too large — try a smaller one." : "Couldn't save booking"), true);
      return;
    }
    toast("Booking added ✓");
    refresh();
  }

  async function updateBooking(id: string, v: BookingFormValue) {
    let res: Response;
    try {
      res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(v)),
      });
    } catch {
      toast("Couldn't reach the server — check your connection and try again.", true);
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      toast(j?.error ?? (res.status === 413 ? "That photo is too large — try a smaller one." : "Couldn't update booking"), true);
      return;
    }
    toast("Booking updated ✓");
    setEditing(null);
    refresh();
  }

  async function deleteBooking(id: string) {
    if (!confirm("Delete this booking?")) return;
    const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't delete booking", true); return; }
    toast("Booking deleted");
    refresh();
  }

  const stats = useMemo(() => {
    const total = bookings.length;
    const collected = bookings.reduce((s, b) => s + (b.paid ? b.amount : 0) + (b.dpAmount ?? 0), 0);
    const unpaidList = bookings.filter((b) => !b.paid);
    const unpaid = unpaidList.reduce((s, b) => s + b.amount, 0);
    const thisMonthIso = dayOf(new Date()).slice(0, 7);
    const thisMonth = bookings.filter((b) => b.date.slice(0, 7) === thisMonthIso).length;
    return { total, thisMonth, collected, unpaid, unpaidCount: unpaidList.length };
  }, [bookings]);

  // Rooms logged per booker — grouped with the full list of bookings behind
  // each name (date, unit, stay type), so the count isn't a dead end; tap a
  // name to see exactly which bookings make it up.
  const byBooker = useMemo(() => {
    const map = new Map<string, Booking[]>();
    bookings.forEach((b) => {
      // Airbnb-imported bookings never have a human booker — that's not the
      // same "nobody logged this" gap as a manually-entered booking missing
      // one, so give it its own label instead of lumping both under Unassigned.
      const n = b.booker?.name ?? (b.platform === "Airbnb" ? "Airbnb booking" : "Unassigned");
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(b);
    });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [bookings]);

  type MethodKey = "Cash" | "GCash" | "BankTransfer" | "Other";
  const METHOD_KEYS: MethodKey[] = ["Cash", "GCash", "BankTransfer", "Other"];

  // Where the money went — per receiver, broken down by how it came in.
  // Airbnb bookings never have a manual "received by"/method (nobody at the
  // property takes that payment by hand) — Airbnb pays out via bank
  // transfer, so that revenue is attributed to a dedicated "Airbnb" entry
  // with method Bank transfer, rather than silently missing from this list.
  const byReceiver = useMemo(() => {
    const map = new Map<string, { total: number; byMethod: Record<MethodKey, number> }>();
    function add(name: string, amount: number, method: string | null) {
      if (!amount) return;
      if (!map.has(name)) map.set(name, { total: 0, byMethod: { Cash: 0, GCash: 0, BankTransfer: 0, Other: 0 } });
      const entry = map.get(name)!;
      entry.total += amount;
      const key: MethodKey = (method === "Cash" || method === "GCash" || method === "BankTransfer") ? method : "Other";
      entry.byMethod[key] += amount;
    }
    bookings.forEach((b) => {
      if (b.paid) {
        const name = b.receivedBy?.name ?? (b.platform === "Airbnb" ? "Airbnb" : null);
        const method = b.method ?? (b.platform === "Airbnb" ? "BankTransfer" : null);
        if (name) add(name, b.amount, method);
      }
      const dpName = b.dpReceivedBy?.name ?? (b.platform === "Airbnb" ? "Airbnb" : null);
      const dpMethod = b.dpMethod ?? (b.platform === "Airbnb" ? "BankTransfer" : null);
      if (dpName) add(dpName, b.dpAmount ?? 0, dpMethod);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [bookings]);

  const [expandedBookers, setExpandedBookers] = useState<Set<string>>(new Set());
  const [expandedReceivers, setExpandedReceivers] = useState<Set<string>>(new Set());
  function toggleExpanded(set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const dateRange = useMemo(() => {
    // UTC-midnight representing "today" in Manila terms (matching how
    // Booking.date is stored) — deterministic regardless of the runtime's
    // own timezone, unlike new Date().setHours(0,0,0,0), which would give a
    // different instant on a UTC server than on a Manila-timezone client
    // and break hydration.
    const startOfToday = new Date(`${dayOf(new Date())}T00:00:00Z`);
    if (dateFilter === "today") {
      const end = new Date(startOfToday);
      end.setUTCDate(end.getUTCDate() + 1);
      return { start: startOfToday, end };
    }
    if (dateFilter === "3days") {
      const end = new Date(startOfToday);
      end.setUTCDate(end.getUTCDate() + 3);
      return { start: startOfToday, end };
    }
    if (dateFilter === "month") {
      const start = new Date(Date.UTC(startOfToday.getUTCFullYear(), startOfToday.getUTCMonth(), 1));
      const end = new Date(Date.UTC(startOfToday.getUTCFullYear(), startOfToday.getUTCMonth() + 1, 1));
      return { start, end };
    }
    // week: Sunday through Saturday of the current week
    const start = new Date(startOfToday);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }, [dateFilter]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      const bDate = new Date(b.date);
      if (bDate < dateRange.start || bDate >= dateRange.end) return false;
      if (statusFilter === "unpaid" && b.paid) return false;
      if (statusFilter === "paid" && !b.paid) return false;
      if (platformFilter !== "all" && b.platform !== platformFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [b.guests.join(" "), b.contactNumber, b.booker?.name, b.receivedBy?.name, b.unit.name].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, search, statusFilter, platformFilter, dateRange]);

  // Group into a day-by-day agenda: each booking contributes a check-in row on
  // its start date and a check-out row on its end date. Any days strictly in
  // between (multi-night stays) get an "occupied guests" row instead — so the
  // room still shows as occupied without being counted as a second booking.
  const agenda = useMemo(() => {
    const days = new Map<string, { checkins: Booking[]; checkouts: Booking[]; occupied: Booking[] }>();
    const getDay = (iso: string) => {
      if (!days.has(iso)) days.set(iso, { checkins: [], checkouts: [], occupied: [] });
      return days.get(iso)!;
    };
    filtered.forEach((b) => {
      const { inIso, outIso } = effectiveRange(b);
      getDay(inIso).checkins.push(b);
      if (outIso !== inIso) {
        getDay(outIso).checkouts.push(b);
        const cursor = new Date(inIso);
        cursor.setDate(cursor.getDate() + 1);
        let guard = 0;
        while (dayOf(cursor) !== outIso && guard < 60) {
          getDay(dayOf(cursor)).occupied.push(b);
          cursor.setDate(cursor.getDate() + 1);
          guard++;
        }
      }
    });
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const AGENDA_PAGE_SIZE = 10;
  const [agendaPage, setAgendaPage] = useState(1);
  useEffect(() => setAgendaPage(1), [search, statusFilter, platformFilter, dateFilter]);
  const agendaPageCount = Math.max(1, Math.ceil(agenda.length / AGENDA_PAGE_SIZE));
  const pagedAgenda = agenda.slice((agendaPage - 1) * AGENDA_PAGE_SIZE, agendaPage * AGENDA_PAGE_SIZE);

  // Today's snapshot for every unit this user can see, independent of the
  // date-range filter above — always reflects the actual current day.
  const dailyReport = useMemo(() => {
    const todayIso = dayOf(new Date());
    return units.map((unit) => {
      const unitBookings = bookings.filter((b) => b.unitId === unit.id);
      const current = unitBookings.find((b) => {
        const { inIso, outIso } = effectiveRange(b);
        return inIso <= todayIso && todayIso < outIso;
      });
      const roomStatus = hkStates.find((s) => s.unitId === unit.id)?.status ?? null;
      if (current) {
        const outTime = fmtTimeStr(current.checkOutTime);
        const { outIso } = effectiveRange(current);
        const untilText = outTime
          ? `until ${outTime}`
          : outIso === todayIso
            ? "checkout time not set"
            : `until ${fmtDate(outIso, { month: "short", day: "numeric" })}`;
        return {
          unit, occupied: true,
          detail: `${current.guests.join(", ") || "Guest"} · ${untilText}`,
          arrival: current, departure: null, roomStatus,
        };
      }
      const checkedOutToday = unitBookings.find((b) => effectiveRange(b).outIso === todayIso);
      if (checkedOutToday) {
        const outTime = fmtTimeStr(checkedOutToday.checkOutTime);
        return {
          unit, occupied: false,
          detail: outTime ? `Available from ${outTime}` : "Checked out today · available now",
          arrival: null, departure: checkedOutToday, roomStatus,
        };
      }
      return { unit, occupied: false, detail: "Available all day", arrival: null, departure: null, roomStatus };
    });
  }, [bookings, units, hkStates]);

  async function markCheckedIn(booking: Booking) {
    const iso = new Date().toISOString();
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, checkedInAt: iso } : b)));
    const { queued } = await fetchOrQueue({
      url: `/api/bookings/${booking.id}`,
      method: "PATCH",
      bodyJson: { checkedInAt: iso },
      label: `Check-in — ${booking.guests[0] ?? booking.id}`,
    });
    toast(queued ? "Checked in — will sync when back online" : "Guest checked in ✓");
  }

  async function markCheckedOut(booking: Booking) {
    const iso = new Date().toISOString();
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, checkedOutAt: iso } : b)));
    const { queued } = await fetchOrQueue({
      url: `/api/bookings/${booking.id}`,
      method: "PATCH",
      bodyJson: { checkedOutAt: iso },
      label: `Check-out — ${booking.guests[0] ?? booking.id}`,
    });
    toast(queued ? "Checked out — will sync when back online" : "Guest checked out ✓");
  }

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight sm:text-[32px]">Bookings</h1>
          <p className="mt-1 text-[15px] text-[var(--gray)]">Log reservations, track who collected the money, and flag unpaid check-ins.</p>
        </div>
        {canEdit && (
          <button onClick={openAddBooking} className="btn-primary flex-none">
            <PlusIcon className="h-4 w-4" /> Add booking
          </button>
        )}
      </div>

      <div className="card mb-5 p-5">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-extrabold tracking-tight">Today&rsquo;s occupancy</h2>
          <p className="text-[13px] font-semibold text-[var(--gray)]">
            {fmtDate(new Date(), { month: "long", day: "numeric", timeZone: "Asia/Manila" })} · {dailyReport.filter((r) => r.occupied).length} of {units.length} units occupied
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {dailyReport.map((r) => (
            <div
              key={r.unit.id}
              className={`flex flex-col gap-2 rounded-xl border p-3 ${r.occupied ? "border-rausch/25 bg-rausch/5" : "border-green/25 bg-green/5"}`}
            >
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${r.occupied ? "bg-rausch" : "bg-green"}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-extrabold">Unit {r.unit.unitNumber} · {r.unit.shortName}</div>
                  <div className="truncate text-[12px] text-[var(--gray)]">{r.detail}</div>
                  <div className="truncate text-[11px] text-[var(--gray)]">Owner: {r.unit.owners?.length ? r.unit.owners.map((o) => o.user.name).join(", ") : "Owner/Admin"}</div>
                </div>
                <span className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide ${r.occupied ? "bg-rausch/15 text-rausch" : "bg-green/15 text-green"}`}>
                  {r.occupied ? "Occupied" : "Open"}
                </span>
              </div>

              {(r.roomStatus || r.arrival || r.departure) && (
                <div className="flex flex-wrap items-center gap-1.5 pl-5">
                  {r.roomStatus && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                        r.roomStatus === "clean" ? "bg-teal/15 text-teal" : r.roomStatus === "cleaning" ? "bg-amber/15 text-amber" : "bg-[var(--bg-2)] text-[var(--gray)]"
                      )}
                    >
                      {r.roomStatus === "clean" ? "Room clean" : r.roomStatus === "cleaning" ? "Being cleaned" : "Needs cleaning"}
                    </span>
                  )}
                  {canEdit && r.arrival && (
                    r.arrival.checkedInAt
                      ? <span className="text-[10.5px] font-bold text-teal">Checked in {fmtTime(r.arrival.checkedInAt)}</span>
                      : <button onClick={() => markCheckedIn(r.arrival!)} className="btn-sm btn-ghost !px-2 !py-1 text-[11px]">Check in</button>
                  )}
                  {canEdit && r.departure && (
                    r.departure.checkedOutAt
                      ? <span className="text-[10.5px] font-bold text-teal">Checked out {fmtTime(r.departure.checkedOutAt)}</span>
                      : <button onClick={() => markCheckedOut(r.departure!)} className="btn-sm btn-ghost !px-2 !py-1 text-[11px]">Check out</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total bookings" value={stats.total} sub={`${stats.thisMonth} this month`} />
        <StatCard label="Total collected" value={peso(stats.collected)} sub="paid so far" />
        <StatCard label="Unpaid" value={peso(stats.unpaid)} sub={`${stats.unpaidCount} bookings`} warn />
        <StatCard label="Units logged" value={new Set(bookings.map((b) => b.unitId)).size} sub="across bookers" />
      </div>

      <Accordion title="Booking insights" sub="who's booking, who's collecting">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-extrabold">Rooms logged per booker</h3>
            <p className="mb-2 text-[12.5px] text-[var(--gray)]">Bookings entered by each booker — tap a name for the breakdown.</p>
            {byBooker.length === 0 && <p className="text-sm text-[var(--gray)]">No bookings yet.</p>}
            {byBooker.map(([name, list]) => {
              const open = expandedBookers.has(name);
              return (
                <div key={name} className="border-t border-[var(--line)] first:border-0">
                  <button type="button" onClick={() => toggleExpanded(setExpandedBookers, name)} className="flex w-full items-center justify-between gap-2 py-2.5 text-left">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-bold">
                      <ChevronDownIcon className={cn("h-3.5 w-3.5 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="flex-none text-sm font-extrabold">{list.length}</span>
                  </button>
                  {open && (
                    <div className="mb-2.5 ml-5 max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                      {list
                        .slice()
                        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
                        .map((b) => (
                          <div key={b.id} className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="min-w-0 truncate text-[var(--gray)]">
                              {fmtDate(b.date, { month: "short", day: "numeric" })} · Unit {b.unit.unitNumber} · {b.unit.shortName}
                            </span>
                            <span className="flex-none font-semibold">{STAY_TYPES[b.stayType as keyof typeof STAY_TYPES]?.label ?? b.stayType}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-extrabold">Where the money went</h3>
            <p className="mb-2 text-[12.5px] text-[var(--gray)]">Total each person collected — tap a name for the payment-method breakdown.</p>
            {byReceiver.length === 0 && <p className="text-sm text-[var(--gray)]">No payments recorded yet.</p>}
            {byReceiver.map(([name, data]) => {
              const open = expandedReceivers.has(name);
              return (
                <div key={name} className="border-t border-[var(--line)] first:border-0">
                  <button type="button" onClick={() => toggleExpanded(setExpandedReceivers, name)} className="flex w-full items-center justify-between gap-2 py-2.5 text-left">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-bold">
                      <ChevronDownIcon className={cn("h-3.5 w-3.5 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="flex-none text-sm font-extrabold">{peso(data.total)}</span>
                  </button>
                  {open && (
                    <div className="mb-2.5 ml-5 space-y-1">
                      {METHOD_KEYS.filter((k) => data.byMethod[k] > 0).map((k) => (
                        <div key={k} className="flex items-center justify-between text-[12px] text-[var(--gray)]">
                          <span>{k === "Other" ? "Unspecified method" : PAYMENT_METHOD_LABEL[k]}</span>
                          <span className="font-semibold text-[var(--ink)]">{peso(data.byMethod[k])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Accordion>

      {canEdit && (
        <>
          <Accordion title="Check availability" sub="chat-style — ask before you log a booking">
            <AvailabilityChat units={units} onPrefillBooking={handlePrefillBooking} />
          </Accordion>
          <div className="mb-3 flex justify-end">
            <button onClick={() => setImportOpen(true)} className="btn btn-sm">
              <UploadIcon className="h-3.5 w-3.5" /> Import bookings
            </button>
          </div>
          <Accordion key={logAccordionKey} title="Log new booking" sub="tap to expand" defaultOpen={!!bookingPrefill || forceLogOpen}>
            <div id="log-new-booking-anchor" />
            <BookingForm units={units} employees={emps} defaultDpFee={defaultDpFee} onSubmit={createBooking} initial={bookingPrefill ?? undefined} ownEmployeeId={ownEmployeeId} />
          </Accordion>
        </>
      )}

      {importOpen && (
        <BookingImportModal onClose={() => setImportOpen(false)} onImported={refresh} />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, number, booker, or receiver" className="field-input pl-10" />
        </div>
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)} className="field-input w-auto">
          <option value="today">Today</option>
          <option value="3days">Next 3 days</option>
          <option value="week">This week (Sun–Sat)</option>
          <option value="month">This month</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid only</option>
          <option value="paid">Paid only</option>
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] ?? p}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card overflow-hidden">
          <EmptyState title="No bookings in this range" sub="Try a wider date range, or open “Log new booking” above to add one." />
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-[var(--gray)]">
            <span>{filtered.length} booking{filtered.length !== 1 ? "s" : ""} shown</span>
            <span className="text-[15px] font-extrabold text-[var(--ink)]">{peso(filtered.reduce((s, b) => s + b.amount, 0))} total</span>
          </div>
          <div className="space-y-5">
            {pagedAgenda.map(([iso, { checkins, checkouts, occupied }]) => (
              <div key={iso}>
                <h3 className="mb-2 text-[13.5px] font-extrabold tracking-tight">
                  {fmtDate(iso, { month: "long", day: "numeric" })}
                  <span className="ml-2 text-[12px] font-semibold text-[var(--gray)]">{new Date(iso).toLocaleDateString("en-PH", { weekday: "long", timeZone: "UTC" })}</span>
                </h3>
                <div className="card divide-y divide-[var(--line)] overflow-hidden">
                  {checkouts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 bg-blue/10 px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-blue">
                        <span className="h-2 w-2 rounded-full bg-blue" /> Check-out
                      </div>
                      {checkouts.map((b) => (
                        <BookingLine key={`out-${b.id}`} b={b} kind="checkout" canEdit={canEdit} onEdit={() => setEditing(b)} onDelete={() => deleteBooking(b.id)} />
                      ))}
                    </div>
                  )}
                  {checkins.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 bg-green/10 px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-green">
                        <span className="h-2 w-2 rounded-full bg-green" /> Check-in
                      </div>
                      {checkins.map((b) => (
                        <BookingLine key={`in-${b.id}`} b={b} kind="checkin" canEdit={canEdit} onEdit={() => setEditing(b)} onDelete={() => deleteBooking(b.id)} />
                      ))}
                    </div>
                  )}
                  {occupied.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 bg-amber/10 px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-amber">
                        <span className="h-2 w-2 rounded-full bg-amber" /> Occupied guests <span className="normal-case text-[var(--gray)]">— not a new booking</span>
                      </div>
                      {occupied.map((b) => (
                        <OccupiedLine key={`occ-${b.id}`} b={b} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={agendaPage} pageCount={agendaPageCount} onPageChange={setAgendaPage} totalLabel={`${agenda.length} day${agenda.length !== 1 ? "s" : ""} with activity`} />
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit booking" maxWidth={640}>
        {editing && (
          <BookingForm
            units={units}
            employees={emps}
            submitLabel="Save changes"
            initial={fromBooking(editing)}
            bookingId={editing.id}
            onCancel={() => setEditing(null)}
            onSubmit={(v) => updateBooking(editing.id, v)}
          />
        )}
      </Modal>
    </div>
  );
}

/** A booking is past due once its check-in date has already passed while the
 * balance is still unpaid — the guest should have settled up by check-in at
 * the latest. Distinct from "Paid"/"Unpaid" (which says nothing about
 * timing) so staff can tell an on-schedule unpaid booking from one that's
 * actually overdue. */
function isPastDue(b: Booking) {
  return !b.paid && dayOf(new Date(b.date)) < dayOf(new Date());
}

function BookingLine({
  b, kind, canEdit, onEdit, onDelete,
}: {
  b: Booking;
  kind: "checkin" | "checkout";
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const time = fmtTimeStr(kind === "checkin" ? b.checkInTime : b.checkOutTime);
  const accent = kind === "checkin" ? "var(--green)" : "var(--blue)";
  const pastDue = isPastDue(b);
  return (
    <div
      className="flex items-start justify-between gap-3 border-t border-[var(--line)] px-4 py-4 first:border-0"
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="truncate text-[17px] font-extrabold leading-tight text-rausch">Unit {b.unit.unitNumber} · {b.unit.shortName}</div>
        <div className="truncate text-[16px] font-extrabold leading-tight">{b.guests.join(", ") || "Guest"}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-[12.5px] text-[var(--gray)]">
          <span>{b.contactNumber || "no contact"}</span>
          <span>{time ?? "time not set"}</span>
        </div>
      </div>

      <div className="flex flex-none flex-col items-end gap-1.5">
        {b.conflict && <Tag variant="unpaid">⚠️ Conflict</Tag>}
        {b.source === "AIRBNB" && <Tag variant="airbnb">Airbnb import</Tag>}
        {pastDue ? <Tag variant="unpaid">⏰ Past due</Tag> : b.paid ? <Tag variant="paid">Paid</Tag> : <Tag variant="unpaid">Unpaid</Tag>}
        <div className="text-right text-[12.5px] font-bold">
          <span className="text-[var(--gray)]">Balance </span>
          <span className={b.paid ? "text-green" : "text-rausch"}>{peso(b.paid ? 0 : b.amount)}</span>
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <button onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"><EditIcon className="h-4 w-4" /></button>
            <button onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function OccupiedLine({ b }: { b: Booking }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[var(--line)] px-4 py-3 first:border-0 text-[13.5px]"
      style={{ boxShadow: "inset 3px 0 0 var(--amber)" }}
    >
      <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber">Occupied</span>
      <span className="font-extrabold text-rausch">Unit {b.unit.unitNumber} · {b.unit.shortName}</span>
      <span className="font-bold">{b.guests.join(", ") || "Guest"}</span>
    </div>
  );
}

function toPayload(v: BookingFormValue) {
  return {
    unitId: v.unitId,
    date: v.date,
    checkOutDate: v.checkOutDate || null,
    stayType: v.stayType,
    checkInTime: v.checkInTime || null,
    checkOutTime: v.checkOutTime || null,
    guests: v.guests,
    pax: v.pax,
    contactNumber: v.contactNumber,
    bookerId: v.bookerId || null,
    // cleanerId is deliberately omitted — the form no longer collects it, and
    // the PATCH endpoint only touches fields present in the payload, so any
    // cleaner already assigned on an older booking is left untouched here.
    platform: v.platform,
    platformOther: v.platformOther || null,
    dpAmount: v.dpAmount,
    dpReceivedById: v.dpReceivedById || null,
    dpMethod: v.dpMethod || null,
    amount: v.amount ?? 0,
    receivedById: v.receivedById || null,
    method: v.method || null,
    paid: v.paid,
  };
}

function fromBooking(b: Booking): Partial<BookingFormValue> {
  return {
    unitId: b.unitId,
    date: b.date.slice(0, 10),
    checkOutDate: b.checkOutDate ? b.checkOutDate.slice(0, 10) : "",
    stayType: b.stayType as any,
    checkInTime: b.checkInTime ?? "",
    checkOutTime: b.checkOutTime ?? "",
    guests: b.guests,
    pax: b.pax,
    contactNumber: b.contactNumber,
    bookerId: b.bookerId ?? "",
    platform: b.platform as any,
    platformOther: b.platformOther ?? "",
    totalAmount: b.amount + (b.dpAmount ?? 0),
    dpAmount: b.dpAmount,
    dpReceivedById: b.dpReceivedById ?? "",
    dpMethod: (b.dpMethod as any) ?? "",
    amount: b.amount,
    receivedById: b.receivedById ?? "",
    method: (b.method as any) ?? "",
    paid: b.paid,
  };
}
