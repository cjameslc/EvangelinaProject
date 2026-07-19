"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { Tag } from "@/components/ui/Tag";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { EditIcon, TrashIcon, SearchIcon, UploadIcon, PlusIcon } from "@/components/ui/Icons";
import { peso, fmtDate, fmtTimeStr } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { canEditBookings, isReadOnlyFinancials } from "@/lib/rbac";
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
  dpAmount: number | null; dpReceivedById: string | null; dpReceivedBy: Employee | null; dpMethod: string | null; dpProofUrl: string | null;
  amount: number; receivedById: string | null; receivedBy: Employee | null; method: string | null; proofUrl: string | null; paid: boolean;
  source?: string; conflict?: boolean;
};

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

export function BookingsView({ role, units, employees, initialBookings, defaultDpFee }: { role: string; units: Unit[]; employees: Employee[]; initialBookings: Booking[]; defaultDpFee: number }) {
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

  const byBooker = useMemo(() => {
    const map = new Map<string, number>();
    bookings.forEach((b) => { const n = b.booker?.name ?? "Unassigned"; map.set(n, (map.get(n) ?? 0) + 1); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [bookings]);

  const byReceiver = useMemo(() => {
    const map = new Map<string, number>();
    bookings.forEach((b) => {
      if (b.receivedBy) map.set(b.receivedBy.name, (map.get(b.receivedBy.name) ?? 0) + (b.paid ? b.amount : 0));
      if (b.dpReceivedBy) map.set(b.dpReceivedBy.name, (map.get(b.dpReceivedBy.name) ?? 0) + (b.dpAmount ?? 0));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [bookings]);

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
        };
      }
      const checkedOutToday = unitBookings.find((b) => effectiveRange(b).outIso === todayIso);
      if (checkedOutToday) {
        const outTime = fmtTimeStr(checkedOutToday.checkOutTime);
        return { unit, occupied: false, detail: outTime ? `Available from ${outTime}` : "Checked out today · available now" };
      }
      return { unit, occupied: false, detail: "Available all day" };
    });
  }, [bookings, units]);

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
              className={`flex items-center gap-3 rounded-xl border p-3 ${r.occupied ? "border-rausch/25 bg-rausch/5" : "border-green/25 bg-green/5"}`}
            >
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
            <p className="mb-2 text-[12.5px] text-[var(--gray)]">Bookings entered by each booker.</p>
            {byBooker.length === 0 && <p className="text-sm text-[var(--gray)]">No bookings yet.</p>}
            {byBooker.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between border-t border-[var(--line)] py-2.5 first:border-0">
                <span className="text-[13.5px] font-bold">{name}</span>
                <span className="text-sm font-extrabold">{count}</span>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-extrabold">Where the money went</h3>
            <p className="mb-2 text-[12.5px] text-[var(--gray)]">Total each person collected.</p>
            {byReceiver.length === 0 && <p className="text-sm text-[var(--gray)]">No payments recorded yet.</p>}
            {byReceiver.map(([name, amt]) => (
              <div key={name} className="flex items-center justify-between border-t border-[var(--line)] py-2.5 first:border-0">
                <span className="text-[13.5px] font-bold">{name}</span>
                <span className="text-sm font-extrabold">{peso(amt)}</span>
              </div>
            ))}
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
            <BookingForm units={units} employees={emps} defaultDpFee={defaultDpFee} onSubmit={createBooking} initial={bookingPrefill ?? undefined} />
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
        {b.paid ? <Tag variant="paid">Paid</Tag> : <Tag variant="unpaid">Unpaid</Tag>}
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
    cleanerId: v.cleanerId || null,
    platform: v.platform,
    platformOther: v.platformOther || null,
    dpAmount: v.dpAmount,
    dpReceivedById: v.dpReceivedById || null,
    dpMethod: v.dpMethod || null,
    dpProofUrl: v.dpProofUrl,
    amount: v.amount ?? 0,
    receivedById: v.receivedById || null,
    method: v.method || null,
    proofUrl: v.proofUrl,
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
    cleanerId: b.cleanerId ?? "",
    platform: b.platform as any,
    platformOther: b.platformOther ?? "",
    totalAmount: b.amount + (b.dpAmount ?? 0),
    dpAmount: b.dpAmount,
    dpReceivedById: b.dpReceivedById ?? "",
    dpMethod: (b.dpMethod as any) ?? "",
    dpProofUrl: b.dpProofUrl,
    amount: b.amount,
    receivedById: b.receivedById ?? "",
    method: (b.method as any) ?? "",
    proofUrl: b.proofUrl,
    paid: b.paid,
  };
}
