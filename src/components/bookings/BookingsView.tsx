"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Accordion } from "@/components/ui/Accordion";
import { Pill } from "@/components/ui/Pill";
import { StatCard } from "@/components/ui/StatCard";
import { Tag } from "@/components/ui/Tag";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { EditIcon, TrashIcon, SearchIcon, UploadIcon, PlusIcon, ChevronDownIcon, ArrowLeftIcon, ArrowRightIcon, FilterIcon, CloseIcon, RefreshIcon, HomeIcon, AlertIcon, CopyIcon } from "@/components/ui/Icons";
import { peso, fmtDate, fmtTime, fmtTimeStr, formatUnitDisplay } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABEL, PAYMENT_METHOD_LABEL, STAY_TYPES } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { canEditBookings, canEditSpecificBooking, canDeleteBookings, isReadOnlyFinancials } from "@/lib/rbac";
import { fetchOrQueue } from "@/lib/offlineQueue";
import { cn } from "@/lib/utils";
import { BookingForm, type BookingFormValue } from "./BookingForm";
import { BookingImportModal } from "./BookingImportModal";
import type { AvailabilityResult } from "./AvailabilityChat";
import { BookingAssistantPanel } from "./BookingAssistantPanel";
import type { ConversationSummary } from "@/lib/chat/clientTypes";
import { OpportunityPanel } from "./OpportunityPanel";
import { MotivationBanner } from "./MotivationBanner";
import { computeOpportunities } from "@/lib/bookingEngine/opportunity";
import type { RateTable } from "@/lib/pricing/rates";
import { manilaTodayISO } from "@/lib/manilaTime";
import { getOccupiedWindow, lastOccupiedDay } from "@/lib/stayRange";
import { collectedAmountPesos } from "@/lib/finance";

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
  cancelledAt?: string | null; cancellationReason?: string | null; cancellationCategory?: string | null;
  refundedAt?: string | null; refundReason?: string | null;
  notes?: string | null;
  confirmationNumber?: string | null;
  confirmationOverrideUntil?: string | null;
};

// Business runs in Manila (UTC+8). Using toISOString() (UTC) to bucket days
// would put "today" a full calendar day behind during Philippine early-morning
// hours, when UTC is still on the previous day — so always bucket by the
// Manila calendar date instead of the server/runtime's own timezone.
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// A distinct border/text color per unit (cycling through the palette
// entries that actually have full numbered shades — see the Tailwind
// palette note in memory) so a guest card's unit badge is recognizable at
// a glance across a busy day, the same way the legacy system's booking
// list colored each unit's badge differently.
const UNIT_BADGE_COLORS = [
  { border: "border-violet/50", text: "text-violet" },
  { border: "border-green/50", text: "text-green" },
  { border: "border-amber/50", text: "text-amber" },
  { border: "border-blue/50", text: "text-blue" },
  { border: "border-teal/50", text: "text-teal" },
];
function unitBadgeColor(unitId: string, units: { id: string }[]) {
  const idx = units.findIndex((u) => u.id === unitId);
  return UNIT_BADGE_COLORS[(idx < 0 ? 0 : idx) % UNIT_BADGE_COLORS.length];
}

/** Effective check-in/check-out day for a booking — derived from the same
 * real-timestamp occupancy engine (stayRange.ts's getOccupiedWindow +
 * lastOccupiedDay) the Calendar page and Schedule grid use, so this List
 * view can never show a different occupied range than what the actual
 * conflict guard enforces. */
function effectiveRange(b: Booking) {
  const inDate = new Date(b.date);
  const window = getOccupiedWindow({
    stayType: b.stayType,
    date: inDate,
    checkOutDate: b.checkOutDate ? new Date(b.checkOutDate) : null,
    checkInTime: b.checkInTime,
    checkOutTime: b.checkOutTime,
    platform: b.platform,
  });
  return { inIso: dayOf(inDate), outIso: dayOf(lastOccupiedDay(window)) };
}

export function BookingsView({
  role, units, employees, initialBookings, defaultDpFee, ownEmployeeId, rates, dailyRevenueGoal = null,
  currentUserId, initialConversations, initialSinceIso, initialFirstBookingIds,
}: {
  role: string; units: Unit[]; employees: Employee[]; initialBookings: Booking[]; defaultDpFee: number; ownEmployeeId: string | null; rates: RateTable; dailyRevenueGoal?: number | null;
  currentUserId: string;
  initialConversations: ConversationSummary[];
  /** The lower date bound the initial `initialBookings` load was scoped to
   * (YYYY-MM-DD) — null once "Show older bookings" has been triggered and
   * the full unbounded history is loaded. Threaded into refresh() so a
   * post-mutation refetch doesn't silently re-narrow or re-widen whatever
   * scope is currently on screen. */
  initialSinceIso: string;
  /** Every guest's true first-ever (non-cancelled) booking id, computed
   * server-side across all-time data — see bookings/page.tsx — since that
   * needs full history regardless of the date-bounded `bookings` state. */
  initialFirstBookingIds: string[];
}) {
  const toast = useToast();
  const [bookings, setBookings] = useState(initialBookings);
  const [emps, setEmps] = useState(employees);
  const [sinceIso, setSinceIso] = useState<string | null>(initialSinceIso);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const firstBookingIds = useMemo(() => new Set(initialFirstBookingIds), [initialFirstBookingIds]);
  const [editing, setEditing] = useState<Booking | null>(null);
  // fromBooking(editing) must NOT be called inline in the BookingForm's
  // `initial` prop — a fresh object every render (from any unrelated state
  // change anywhere in this large component, e.g. a toast, a poll) changes
  // its reference, which retriggers BookingForm's own [initial] effect and
  // silently resets whatever the user had just typed back to the original
  // values. Save then "succeeds" but nothing actually changed — this is
  // exactly the bug where an edited check-out time reverted before saving.
  // Memoizing on editing's identity keeps the same object across renders
  // for the same edit session.
  const editingInitial = useMemo(() => (editing ? fromBooking(editing) : undefined), [editing]);
  // Lets an external link (e.g. a chat message's booking card "Quick Open")
  // land here with the search box already filled in, via /bookings?search=.
  // Read once on mount only — the search box itself is still a normal
  // uncontrolled-by-the-URL input after that, exactly as before.
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams?.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [bookerFilter, setBookerFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "3days" | "week" | "month">("week");
  const [checkinScheduleTab, setCheckinScheduleTab] = useState<"today" | "tomorrow" | "week">("today");
  // A Booker lands on their own list first — every other role that reaches
  // this page (Owner/Admin, Co-owner, Housekeeping) sees exactly what it
  // showed before this tab bar existed, since "all" with no tab bar
  // rendered is the same underlying scope as today.
  const isBookerView = role === "BOOKER" && !!ownEmployeeId;
  const [bookingsTab, setBookingsTab] = useState<"mine" | "all" | "upcoming" | "active" | "completed" | "cancelled">(
    isBookerView ? "mine" : "all"
  );
  const [importOpen, setImportOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<Partial<BookingFormValue> | null>(null);
  const [logAccordionKey, setLogAccordionKey] = useState(0);
  const [forceLogOpen, setForceLogOpen] = useState(false);
  const [lastAvailability, setLastAvailability] = useState<{ data: AvailabilityResult; unitLabel: string } | null>(null);

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
    // Re-request whatever window is already on screen — sinceIso stays
    // whatever it currently is (the original 90-day default, or null after
    // "Show older bookings" widened it) so a refetch after a mutation never
    // silently changes scope out from under the user.
    const res = await fetch(sinceIso ? `/api/bookings?since=${sinceIso}` : "/api/bookings");
    if (res.ok) setBookings(await res.json());
    const eRes = await fetch("/api/employees");
    if (eRes.ok) setEmps(await eRes.json());
  }

  /** Explicit escape hatch for the rare case a search/tab needs a booking
   * older than the default 90-day window — re-fetches the full unbounded
   * history once and never re-narrows for the rest of the session. */
  async function loadOlderBookings() {
    if (!sinceIso || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) { setBookings(await res.json()); setSinceIso(null); }
      else toast("Couldn't load older bookings — try again.", true);
    } finally {
      setLoadingOlder(false);
    }
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
      return false;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.error ?? (res.status === 413 ? "That photo is too large — try a smaller one." : "Couldn't save booking"), true);
      return false;
    }
    toast("Booking added ✓");
    refresh();
    return true;
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
      return false;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      toast(j?.error ?? (res.status === 413 ? "That photo is too large — try a smaller one." : "Couldn't update booking"), true);
      return false;
    }
    toast("Booking updated ✓");
    setEditing(null);
    refresh();
    return true;
  }

  async function updateConfirmation(id: string, action: "reactivate" | "regenerate") {
    const res = await fetch(`/api/bookings/${id}/confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast(j?.error ?? "Couldn't update the booking ID.", true); return; }
    toast(action === "reactivate" ? "Booking ID reactivated ✓" : "New booking ID generated ✓");
    setEditing((e) => (e && e.id === id ? { ...e, confirmationNumber: j.confirmationNumber, confirmationOverrideUntil: j.confirmationOverrideUntil } : e));
    refresh();
  }

  async function deleteBooking(id: string) {
    if (!confirm("Delete this booking?")) return;
    const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't delete booking", true); return; }
    toast("Booking deleted");
    refresh();
  }

  // Cancel and Remove both land here — the only real difference is which
  // category the operator picks. Only "guestCancelled" keeps the booker's
  // commission (see isCommissionEligible in @/lib/bookingStatus); the two
  // staff-initiated categories never do, regardless of how much was paid.
  const [cancelModal, setCancelModal] = useState<{ booking: Booking; mode: "cancel" | "remove" } | null>(null);
  async function submitCancelOrRemove(id: string, category: "guestCancelled" | "bookerConfusion" | "vipReassignment", reason: string) {
    const res = await fetch(`/api/bookings/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, category }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error ?? "Couldn't update booking", true); return false; }
    toast(category === "guestCancelled" ? "Booking cancelled" : "Booking removed from calendar");
    setCancelModal(null);
    refresh();
    return true;
  }

  // Marking a booking refunded is the one thing that reverses commission —
  // a cancellation alone doesn't, as long as the deposit was kept (see
  // isCommissionEligible in @/lib/bookingStatus).
  async function refundBooking(id: string) {
    const reason = prompt("Reason for marking this booking refunded? (required)");
    if (reason === null) return;
    if (!reason.trim()) { toast("A reason is required to mark a booking refunded.", true); return; }
    const res = await fetch(`/api/bookings/${id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error ?? "Couldn't mark booking refunded", true); return; }
    toast("Booking marked refunded");
    refresh();
  }

  // Opportunity Engine — recomputes automatically off the same `bookings`
  // state every other section on this page already reads, so creating,
  // editing, or cancelling a booking updates it for free via the existing
  // refresh() → setBookings() flow. Always "today" — matches every one of
  // the spec's own examples ("today," "before the day ends"); Tomorrow/This
  // week are deliberately out of scope for a same-day fill-the-schedule
  // tool. Zero extra network requests: computeOpportunities is pure
  // client-side date math (see opportunity.ts).
  const opportunitiesDate = manilaTodayISO();
  const opportunities = useMemo(
    () => computeOpportunities(units, bookings, opportunitiesDate, rates, defaultDpFee),
    [units, bookings, opportunitiesDate, rates, defaultDpFee]
  );
  const realizedToday = useMemo(
    () => bookings.filter((b) => b.date.slice(0, 10) === opportunitiesDate && !b.cancelledAt).reduce((s, b) => s + collectedAmountPesos(b), 0),
    [bookings, opportunitiesDate]
  );

  // Today's occupied-unit count for the motivation banner — a unit counts
  // once even if it has two same-day slots booked (e.g. Daycation + Night),
  // matching effectiveRange's real occupied-window math (same helper the
  // agenda list below already uses) rather than a naive check-in-date match.
  const occupiedUnitsToday = useMemo(() => {
    const ids = new Set<string>();
    for (const b of bookings) {
      if (b.cancelledAt) continue;
      const { inIso, outIso } = effectiveRange(b);
      if (inIso <= opportunitiesDate && opportunitiesDate <= outIso) ids.add(b.unitId);
    }
    return ids.size;
  }, [bookings, opportunitiesDate]);

  // Every metric on this page (stat cards, Booking insights) is scoped to a
  // Booker's own bookings, always — independent of whichever list tab is
  // selected below. Every other role that can reach this page keeps full,
  // unrestricted visibility across every booker, identical to today.
  const myBookings = useMemo(
    () => (role === "BOOKER" && ownEmployeeId ? bookings.filter((b) => b.bookerId === ownEmployeeId) : bookings),
    [bookings, role, ownEmployeeId]
  );

  // Upcoming check-ins — the Bookings-tab mirror of Housekeeping's
  // "Cleaning schedule" (same Today/Tomorrow/This week bucketing, same
  // Manila-safe day math), but keyed on each booking's check-in day instead
  // of checkout. Always visible regardless of which bookingsTab/week filter
  // is selected below — myBookings (not the week/tab-filtered list) is the
  // source, same booker-scoping every other metric on this page already
  // uses, so a Booker only sees their own upcoming arrivals.
  const checkinSchedule = useMemo(() => {
    const withCheckin = myBookings.filter((b) => !b.cancelledAt).map((b) => ({ ...b, checkinIso: dayOf(new Date(b.date)) }));
    const todayI = dayOf(new Date());
    const tomorrowD = new Date(`${todayI}T00:00:00Z`); tomorrowD.setUTCDate(tomorrowD.getUTCDate() + 1);
    const tomorrowI = dayOf(tomorrowD);
    const weekEndD = new Date(`${todayI}T00:00:00Z`); weekEndD.setUTCDate(weekEndD.getUTCDate() + 6);
    const weekEndI = dayOf(weekEndD);

    const byTime = (a: (typeof withCheckin)[number], b: (typeof withCheckin)[number]) =>
      a.checkinIso.localeCompare(b.checkinIso) || (a.checkInTime ?? "99:99").localeCompare(b.checkInTime ?? "99:99");

    return {
      today: withCheckin.filter((b) => b.checkinIso === todayI).sort(byTime),
      tomorrow: withCheckin.filter((b) => b.checkinIso === tomorrowI).sort(byTime),
      week: withCheckin.filter((b) => b.checkinIso >= todayI && b.checkinIso <= weekEndI).sort(byTime),
    };
  }, [myBookings]);
  const checkinScheduleList = checkinSchedule[checkinScheduleTab];

  // The personalized greeting's three numbers — deliberately independent of
  // weekOffset/dateFilter/bookingsTab below (those are all navigable views
  // the user can wander away from); the greeting always answers "what does
  // my workload look like right now."
  const greetingStats = useMemo(() => {
    if (!isBookerView) return null;
    const todayIso = dayOf(new Date());
    const startOfToday = new Date(`${todayIso}T00:00:00Z`);
    const weekStart = new Date(startOfToday);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    let upcoming = 0, activeToday = 0, checkInsThisWeek = 0;
    for (const b of myBookings) {
      const status = lifecycleStatus(b, todayIso);
      if (status === "upcoming") upcoming++;
      if (status === "active") activeToday++;
      const bDate = new Date(b.date);
      if (!b.cancelledAt && bDate >= weekStart && bDate < weekEnd) checkInsThisWeek++;
    }
    return { upcoming, activeToday, checkInsThisWeek };
  }, [isBookerView, myBookings]);

  // Total bookings / collected / unpaid / units logged, and the Booking
  // insights section below (Rooms logged per booker + Where the money
  // went), are all scoped to a single Sunday-Saturday week, navigable via
  // weekOffset — one filter driving every metric on this page, so "this
  // week" always means the same thing wherever you look on it.
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekNavOpen, setWeekNavOpen] = useState(false);
  const weekRange = useMemo(() => {
    const startOfToday = new Date(`${dayOf(new Date())}T00:00:00Z`);
    const start = new Date(startOfToday);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay() + weekOffset * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }, [weekOffset]);
  const weekLabel = useMemo(() => {
    const endInclusive = new Date(weekRange.end);
    endInclusive.setUTCDate(endInclusive.getUTCDate() - 1);
    const sameMonth = weekRange.start.getUTCMonth() === endInclusive.getUTCMonth();
    const startStr = fmtDate(weekRange.start, { month: "short", day: "numeric", timeZone: "UTC" });
    const endStr = fmtDate(endInclusive, sameMonth ? { day: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" });
    return `${startStr} – ${endStr}`;
  }, [weekRange]);
  // Cancellation alone no longer excludes a booking from money figures — a
  // cancelled booking whose deposit was kept (never refunded) still counts
  // as real revenue, same rule /api/my-earnings applies for commission (see
  // isCommissionEligible in @/lib/bookingStatus). Only a refund removes
  // money that was actually returned to the guest.
  const weekBookings = useMemo(
    () => myBookings.filter((b) => new Date(b.date) >= weekRange.start && new Date(b.date) < weekRange.end),
    [myBookings, weekRange]
  );

  const stats = useMemo(() => {
    const total = weekBookings.length;
    const collected = weekBookings.reduce((s, b) => s + collectedAmountPesos(b), 0);
    // "Unpaid, needs follow-up" only makes sense for a still-active booking —
    // a cancelled-and-never-paid booking has no guest coming to chase payment
    // from.
    const unpaidList = weekBookings.filter((b) => !b.paid && !b.cancelledAt);
    const unpaid = unpaidList.reduce((s, b) => s + b.amount, 0);
    const unitsLogged = new Set(weekBookings.map((b) => b.unitId)).size;
    return { total, collected, unpaid, unpaidCount: unpaidList.length, unitsLogged };
  }, [weekBookings]);

  // weekBookings is already scoped to myBookings above, so this is just an
  // alias kept for the two insight blocks below ("who's booking" / "where
  // the money went") to read from.
  const insightBookings = weekBookings;

  // Rooms logged per booker — grouped with the full list of bookings behind
  // each name (date, unit, stay type), so the count isn't a dead end; tap a
  // name to see exactly which bookings make it up.
  const byBooker = useMemo(() => {
    const map = new Map<string, Booking[]>();
    insightBookings.forEach((b) => {
      // Airbnb-imported and guest self-service ("Direct") bookings never
      // have a human booker — neither is the same "nobody logged this" gap
      // as a manually-entered booking missing one, so each gets its own
      // label instead of lumping all three under Unassigned.
      const n = b.booker?.name ?? (b.platform === "Airbnb" ? "Airbnb booking" : b.platform === "Direct" ? "Direct Booking" : "Unassigned");
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(b);
    });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [insightBookings]);

  type MethodKey = "Cash" | "GCash" | "BankTransfer";
  const METHOD_KEYS: MethodKey[] = ["Cash", "GCash", "BankTransfer"];

  // Where the money went — per receiver, broken down by how it came in.
  // Airbnb bookings never have a manual "received by"/method (nobody at the
  // property takes that payment by hand) — Airbnb pays out via bank
  // transfer, so that revenue is attributed to a dedicated "Airbnb" entry
  // with method Bank transfer, rather than silently missing from this list.
  // Only these 3 real methods ever exist here — a booking with no method
  // recorded at all falls back to GCash (the property's actual default/most
  // common collection method), never a 4th "Unspecified" bucket.
  const byReceiver = useMemo(() => {
    const map = new Map<string, { total: number; byMethod: Record<MethodKey, number>; bookingIds: Set<string> }>();
    function add(name: string, amount: number, method: string | null, bookingRef: string) {
      if (!amount) return;
      if (!map.has(name)) map.set(name, { total: 0, byMethod: { Cash: 0, GCash: 0, BankTransfer: 0 }, bookingIds: new Set() });
      const entry = map.get(name)!;
      entry.total += amount;
      const key: MethodKey = (method === "Cash" || method === "BankTransfer") ? method : "GCash";
      entry.byMethod[key] += amount;
      entry.bookingIds.add(bookingRef);
    }
    insightBookings.forEach((b) => {
      // Refunded money was given back — it never belongs in "where the
      // money went" regardless of paid/cancelled status.
      if (b.refundedAt) return;
      const bookingRef = b.confirmationNumber ?? b.id;
      if (b.paid) {
        const name = b.receivedBy?.name ?? (b.platform === "Airbnb" ? "Airbnb" : null);
        const method = b.method ?? (b.platform === "Airbnb" ? "BankTransfer" : null);
        if (name) add(name, b.amount, method, bookingRef);
      }
      const dpName = b.dpReceivedBy?.name ?? (b.platform === "Airbnb" ? "Airbnb" : null);
      const dpMethod = b.dpMethod ?? (b.platform === "Airbnb" ? "BankTransfer" : null);
      if (dpName) add(dpName, b.dpAmount ?? 0, dpMethod, bookingRef);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [insightBookings]);

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

  // The tab bar's scope — "mine" and the four lifecycle tabs all read from
  // myBookings (a Booker's own workload), "all" breaks out to the complete,
  // unrestricted list. For every non-Booker role this is always just
  // `bookings`, since bookingsTab is permanently "all" there (no tab bar
  // renders) — identical to the page's behavior before these tabs existed.
  const tabScopedBookings = useMemo(() => {
    if (!isBookerView) return bookings;
    if (bookingsTab === "all") return bookings;
    if (bookingsTab === "mine") return myBookings;
    const todayIso = dayOf(new Date());
    return myBookings.filter((b) => lifecycleStatus(b, todayIso) === bookingsTab);
  }, [isBookerView, bookings, myBookings, bookingsTab]);

  // Counts for the tab bar's badges — cheap enough to just recompute
  // straight from myBookings (a handful of bookings per booker in practice)
  // rather than maintaining a second parallel set of memoized counters.
  const tabCounts = useMemo(() => {
    if (!isBookerView) return null;
    const todayIso = dayOf(new Date());
    const counts = { mine: myBookings.length, all: bookings.length, upcoming: 0, active: 0, completed: 0, cancelled: 0 };
    for (const b of myBookings) counts[lifecycleStatus(b, todayIso)]++;
    return counts;
  }, [isBookerView, myBookings, bookings]);

  // Every filter except the day-range pill — List further narrows this by
  // dateRange below.
  const nonDateFiltered = useMemo(() => {
    return tabScopedBookings.filter((b) => {
      if (statusFilter === "unpaid" && b.paid) return false;
      if (statusFilter === "paid" && !b.paid) return false;
      if (statusFilter === "cancelled" && !b.cancelledAt) return false;
      if (statusFilter === "cancelled-guest" && b.cancellationCategory !== "guestCancelled") return false;
      if (statusFilter === "removed-confusion" && b.cancellationCategory !== "bookerConfusion") return false;
      if (statusFilter === "removed-transfer" && b.cancellationCategory !== "vipReassignment") return false;
      if (statusFilter === "cancelled-needs-review" && !(b.cancelledAt && !b.cancellationCategory)) return false;
      if (statusFilter === "pastdue" && !isPastDue(b)) return false;
      if (platformFilter !== "all" && b.platform !== platformFilter) return false;
      if (bookerFilter !== "all" && b.bookerId !== bookerFilter) return false;
      if (unitFilter !== "all" && b.unitId !== unitFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [b.guests.join(" "), b.contactNumber, b.booker?.name, b.receivedBy?.name, b.unit.name, b.confirmationNumber]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tabScopedBookings, search, statusFilter, platformFilter, bookerFilter, unitFilter]);

  const filtered = useMemo(() => {
    return nonDateFiltered.filter((b) => {
      const bDate = new Date(b.date);
      return bDate >= dateRange.start && bDate < dateRange.end;
    });
  }, [nonDateFiltered, dateRange]);

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
        // A cancelled booking still shows its check-in/check-out entries
        // (audit trail — see the Cancelled tag on BookingLine) but no longer
        // actually occupies the unit on the days in between.
        if (!b.cancelledAt) {
          const cursor = new Date(inIso);
          cursor.setDate(cursor.getDate() + 1);
          let guard = 0;
          while (dayOf(cursor) !== outIso && guard < 60) {
            getDay(dayOf(cursor)).occupied.push(b);
            cursor.setDate(cursor.getDate() + 1);
            guard++;
          }
        }
      }
    });
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const AGENDA_PAGE_SIZE = 10;
  const [agendaPage, setAgendaPage] = useState(1);
  useEffect(() => setAgendaPage(1), [search, statusFilter, platformFilter, bookerFilter, unitFilter, dateFilter, bookingsTab]);
  const agendaPageCount = Math.max(1, Math.ceil(agenda.length / AGENDA_PAGE_SIZE));
  const pagedAgenda = agenda.slice((agendaPage - 1) * AGENDA_PAGE_SIZE, agendaPage * AGENDA_PAGE_SIZE);

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

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6">
      <MotivationBanner occupiedUnits={occupiedUnitsToday} totalUnits={units.length} onFillSlots={openAddBooking} canEdit={canEdit} />

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

      {canEdit && (
        <OpportunityPanel
          opportunities={opportunities}
          dayLabel="Today"
          isToday
          dailyRevenueGoal={dailyRevenueGoal}
          realizedToday={realizedToday}
          onBook={(unitId, stayType) => handlePrefillBooking({ unitId, date: opportunitiesDate, stayType })}
        />
      )}

      {isBookerView && greetingStats && (
        <div className="mb-5 rounded-2xl border border-rausch/20 bg-gradient-to-br from-rausch/10 via-transparent to-transparent p-5">
          <h2 className="text-[19px] font-extrabold tracking-tight">
            Welcome back, {emps.find((e) => e.id === ownEmployeeId)?.name.split(" ")[0] ?? "there"}! 👋
          </h2>
          <p className="mt-1 text-[13.5px] text-[var(--gray)]">You currently have:</p>
          <ul className="mt-2 space-y-1 text-[13.5px] font-semibold">
            <li>• {greetingStats.upcoming} upcoming booking{greetingStats.upcoming !== 1 ? "s" : ""}</li>
            <li>• {greetingStats.activeToday} guest{greetingStats.activeToday !== 1 ? "s" : ""} staying today</li>
            <li>• {greetingStats.checkInsThisWeek} check-in{greetingStats.checkInsThisWeek !== 1 ? "s" : ""} this week</li>
          </ul>
          <p className="mt-2 text-[12.5px] text-[var(--gray)]">Below are your assigned bookings.</p>
        </div>
      )}

      <Accordion title="Upcoming check-ins" sub="by guest arrival">
        <div className="mb-4 inline-flex gap-1 rounded-full bg-[var(--bg-2)] p-1">
          {([["today", `Today (${checkinSchedule.today.length})`], ["tomorrow", `Tomorrow (${checkinSchedule.tomorrow.length})`], ["week", `This week (${checkinSchedule.week.length})`]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCheckinScheduleTab(key)}
              className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold transition", checkinScheduleTab === key ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
            >
              {label}
            </button>
          ))}
        </div>

        {checkinScheduleList.length === 0 ? (
          <p className="text-[13px] text-[var(--gray)]">No check-ins {checkinScheduleTab === "today" ? "today" : checkinScheduleTab === "tomorrow" ? "tomorrow" : "this week"}.</p>
        ) : (
          <div className="space-y-2.5">
            {checkinScheduleList.map((b) => {
              const stayMeta = STAY_TYPES[b.stayType as keyof typeof STAY_TYPES];
              return (
                <div key={b.id} className="rounded-2xl border border-[var(--line)] p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-extrabold">{formatUnitDisplay(b.unit.unitNumber, b.unit.shortName)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-[var(--gray)]">{b.guests?.[0] ?? "Guest"} · {stayMeta?.label ?? b.stayType}</div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div>
                      <div className="text-[11px] font-bold text-[var(--gray)]">Check-in</div>
                      <div className="text-[13px] font-extrabold">
                        {checkinScheduleTab === "week" ? fmtDate(b.checkinIso, { month: "short", day: "numeric", timeZone: "UTC" }) : ""}
                        {checkinScheduleTab === "week" && b.checkInTime ? " · " : ""}
                        {b.checkInTime ? fmtTimeStr(b.checkInTime) : (checkinScheduleTab !== "week" ? "—" : "")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-[var(--gray)]">Booker</div>
                      <div className="text-[13px] font-extrabold">{b.booker?.name ?? "Unassigned"}</div>
                    </div>
                    {b.checkedInAt ? (
                      <span className="ml-auto flex-none rounded-full bg-teal/15 px-2.5 py-1 text-[11px] font-extrabold text-teal">Checked in {fmtTime(b.checkedInAt)}</span>
                    ) : canEdit ? (
                      <button onClick={() => markCheckedIn(b)} className="btn-sm btn-ghost ml-auto flex-none !px-2.5 !py-1 text-[11px]">Check in</button>
                    ) : (
                      <span className="ml-auto flex-none rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--gray)]">Upcoming</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Accordion>

      {/* Collapsed by default — a quiet "Jul 19 – 25" pill, not a prominent
          filter bar, since most visits just want this week and shouldn't be
          reminded there's a filter at all. Tap it to reveal the week
          navigator when you actually need a different week. */}
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setWeekNavOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold text-[var(--gray)] transition hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
        >
          <FilterIcon className="h-3 w-3" />
          {weekLabel}
        </button>
      </div>
      {weekNavOpen && (
        <div className="mb-4 flex items-center justify-center gap-1.5">
          <button onClick={() => setWeekOffset((o) => o - 1)} className="btn-icon !h-9 !w-9" aria-label="Previous week"><ArrowLeftIcon className="h-4 w-4" /></button>
          <span className="min-w-[150px] text-center text-[14px] font-extrabold">{weekLabel}</span>
          <button onClick={() => setWeekOffset((o) => o + 1)} disabled={weekOffset >= 0} className="btn-icon !h-9 !w-9" aria-label="Next week"><ArrowRightIcon className="h-4 w-4" /></button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="btn-sm btn-ghost ml-1">This week</button>
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total bookings" value={stats.total} sub={weekLabel} />
        <StatCard label="Total collected" value={peso(stats.collected)} sub="paid so far" />
        <StatCard label="Unpaid" value={peso(stats.unpaid)} sub={`${stats.unpaidCount} bookings`} warn />
        <StatCard label="Units logged" value={stats.unitsLogged} sub="across bookers" />
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
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setEditing(b)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-[12px] hover:bg-[var(--bg-2)]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-[var(--ink)]">{b.guests.join(", ") || "Guest"}</span>
                              <span className="block truncate text-[var(--gray)]">
                                {fmtDate(b.date, { month: "short", day: "numeric" })} · {formatUnitDisplay(b.unit.unitNumber)}
                              </span>
                            </span>
                            <span className="flex-none font-semibold">{STAY_TYPES[b.stayType as keyof typeof STAY_TYPES]?.label ?? b.stayType}</span>
                          </button>
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
                          <span>{PAYMENT_METHOD_LABEL[k]}</span>
                          <span className="font-semibold text-[var(--ink)]">{peso(data.byMethod[k])}</span>
                        </div>
                      ))}
                      <p className="pt-0.5 text-[10.5px] leading-relaxed text-[var(--gray)]">
                        Bookings: {[...data.bookingIds].join(", ")}
                      </p>
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
          <div id="check-availability-anchor" className="mb-3">
            <BookingAssistantPanel
              units={units}
              onPrefillBooking={handlePrefillBooking}
              onAvailabilityResult={(data, unitLabel) => setLastAvailability({ data, unitLabel })}
              currentUserId={currentUserId}
              isAdmin={role === "OWNER_ADMIN"}
              initialConversations={initialConversations}
              recentBookings={bookings.slice(0, 10).map((b) => ({ confirmationNumber: b.confirmationNumber ?? null, guests: b.guests, unit: { unitNumber: b.unit.unitNumber, name: b.unit.name } }))}
              lastAvailability={lastAvailability}
              onOpenCreateBooking={openAddBooking}
            />
          </div>
          <div className="mb-3 flex justify-end">
            <button onClick={() => setImportOpen(true)} className="btn btn-sm">
              <UploadIcon className="h-3.5 w-3.5" /> Import bookings
            </button>
          </div>
          <Accordion key={logAccordionKey} title="Log new booking" sub="tap to expand" defaultOpen={!!bookingPrefill || forceLogOpen}>
            <div id="log-new-booking-anchor" />
            <BookingForm units={units} employees={emps} defaultDpFee={defaultDpFee} rates={rates} onSubmit={createBooking} initial={bookingPrefill ?? undefined} ownEmployeeId={ownEmployeeId} />
          </Accordion>
        </>
      )}

      {importOpen && (
        <BookingImportModal onClose={() => setImportOpen(false)} onImported={refresh} />
      )}

      {isBookerView && tabCounts && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Pill on={bookingsTab === "mine"} onClick={() => setBookingsTab("mine")}>My Bookings ({tabCounts.mine})</Pill>
          <Pill on={bookingsTab === "all"} onClick={() => setBookingsTab("all")}>All Bookings ({tabCounts.all})</Pill>
          <Pill on={bookingsTab === "upcoming"} onClick={() => setBookingsTab("upcoming")}>Upcoming ({tabCounts.upcoming})</Pill>
          <Pill on={bookingsTab === "active"} onClick={() => setBookingsTab("active")}>Active ({tabCounts.active})</Pill>
          <Pill on={bookingsTab === "completed"} onClick={() => setBookingsTab("completed")}>Completed ({tabCounts.completed})</Pill>
          <Pill on={bookingsTab === "cancelled"} onClick={() => setBookingsTab("cancelled")}>Cancelled ({tabCounts.cancelled})</Pill>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, phone, booking ID, booker, or receiver" className="field-input pl-10" />
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
          <option value="pastdue">Past due</option>
          <optgroup label="Cancelled / removed">
            <option value="cancelled">All cancelled</option>
            <option value="cancelled-guest">Cancelled — guest (commission kept)</option>
            <option value="removed-transfer">Removed — guest transfer</option>
            <option value="removed-confusion">Removed — incorrect entry</option>
            <option value="cancelled-needs-review">Cancelled — needs review (uncategorized)</option>
          </optgroup>
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] ?? p}</option>)}
        </select>
        <select value={bookerFilter} onChange={(e) => setBookerFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All bookers</option>
          {emps.filter((e) => e.role === "BOOKER").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.shortName}</option>)}
        </select>
      </div>

      {sinceIso && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--gray)]">
          <span>Showing bookings from the last 90 days. Search and filters above only match within that window.</span>
          <button onClick={loadOlderBookings} disabled={loadingOlder} className="btn-sm btn-ghost flex-none disabled:opacity-60">
            {loadingOlder ? "Loading…" : "Show older bookings"}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card overflow-hidden">
          <EmptyState title="No bookings in this range" sub="Try a wider date range, or open “Log new booking” above to add one." />
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-[var(--gray)]">
            <span>{filtered.length} booking{filtered.length !== 1 ? "s" : ""} shown</span>
            <span className="text-[15px] font-extrabold text-[var(--ink)]">{peso(filtered.filter((b) => !b.refundedAt).reduce((s, b) => s + b.amount, 0))} total</span>
          </div>
          <div className="space-y-6">
            {pagedAgenda.map(([iso, { checkins, checkouts, occupied }]) => (
              <div key={iso}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-2">
                  <h3 className="text-[16px] font-extrabold tracking-tight">
                    {fmtDate(iso, { month: "long", day: "numeric", year: "numeric" })}
                  </h3>
                  <span className="text-[12px] font-semibold text-[var(--gray)]">
                    {checkins.length + checkouts.length} booking{checkins.length + checkouts.length !== 1 ? "s" : ""}
                    {checkouts.length > 0 && <> · Out: {checkouts.length}</>}
                    {(checkins.length > 0 || occupied.length > 0) && <> · In+Occupied: {checkins.length + occupied.length}</>}
                  </span>
                </div>

                {checkouts.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-rausch">
                      <span className="h-2 w-2 rounded-full bg-rausch" /> Check-out list ({checkouts.length})
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {checkouts.map((b) => (
                        <BookingLine
                          key={`out-${b.id}`} b={b} kind="checkout"
                          unitColor={unitBadgeColor(b.unitId, units)}
                          isFirstBooking={firstBookingIds.has(b.id)}
                          canEdit={canEditSpecificBooking(role as any, b.bookerId, ownEmployeeId, b.platform)} canDelete={canDeleteBookings(role as any)}
                          onEdit={() => setEditing(b)} onCancel={() => setCancelModal({ booking: b, mode: "cancel" })} onRefund={() => refundBooking(b.id)} onDelete={() => deleteBooking(b.id)} onRemove={() => setCancelModal({ booking: b, mode: "remove" })}
                          toast={toast}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {checkins.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-green">
                      <span className="h-2 w-2 rounded-full bg-green" /> Check-in list ({checkins.length})
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {checkins.map((b) => (
                        <BookingLine
                          key={`in-${b.id}`} b={b} kind="checkin"
                          unitColor={unitBadgeColor(b.unitId, units)}
                          isFirstBooking={firstBookingIds.has(b.id)}
                          canEdit={canEditSpecificBooking(role as any, b.bookerId, ownEmployeeId, b.platform)} canDelete={canDeleteBookings(role as any)}
                          onEdit={() => setEditing(b)} onCancel={() => setCancelModal({ booking: b, mode: "cancel" })} onRefund={() => refundBooking(b.id)} onDelete={() => deleteBooking(b.id)} onRemove={() => setCancelModal({ booking: b, mode: "remove" })}
                          toast={toast}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {occupied.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-amber">
                      <span className="h-2 w-2 rounded-full bg-amber" /> Occupied guests <span className="font-semibold text-[var(--gray)]">— not a new booking</span>
                    </div>
                    <div className="card divide-y divide-[var(--line)] overflow-hidden">
                      {occupied.map((b) => (
                        <OccupiedLine key={`occ-${b.id}`} b={b} />
                      ))}
                    </div>
                  </div>
                )}
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
            rates={rates}
            submitLabel="Save changes"
            initial={editingInitial}
            bookingId={editing.id}
            confirmationNumber={editing.confirmationNumber}
            confirmationOverrideUntil={editing.confirmationOverrideUntil}
            confirmationDate={editing.date}
            confirmationCheckOutDate={editing.checkOutDate}
            confirmationCancelled={!!editing.cancelledAt}
            onReactivateConfirmation={role === "OWNER_ADMIN" ? () => updateConfirmation(editing.id, "reactivate") : undefined}
            onRegenerateConfirmation={role === "OWNER_ADMIN" ? () => updateConfirmation(editing.id, "regenerate") : undefined}
            onCancel={() => setEditing(null)}
            onSubmit={(v) => updateBooking(editing.id, v)}
            ownEmployeeId={ownEmployeeId}
            role={role}
          />
        )}
      </Modal>

      <CancelOrRemoveModal state={cancelModal} onClose={() => setCancelModal(null)} onConfirm={submitCancelOrRemove} />
    </div>
  );
}

type CancelCategory = "guestCancelled" | "bookerConfusion" | "vipReassignment";

const CANCEL_CATEGORY_OPTIONS: { value: CancelCategory; label: string; detail: string }[] = [
  { value: "guestCancelled", label: "Legit — the guest cancelled", detail: "A genuine guest-initiated cancellation. Keeps the booker's commission if money was collected and never refunded." },
  { value: "bookerConfusion", label: "Booker confusion / duplicate", detail: "Logged in error, or a duplicate of another booking. No commission." },
  { value: "vipReassignment", label: "VIP priority reassignment", detail: "Bumping this guest to accommodate a higher-priority client. No commission." },
];

/**
 * One modal behind both "Cancel" (guest-initiated, defaults to
 * guestCancelled) and "Remove" (staff-initiated bump, defaults to
 * bookerConfusion) — same underlying endpoint and commission consequence
 * either way (see isCommissionEligible in @/lib/bookingStatus), so the only
 * real difference between the two entry points is which option starts
 * selected. Requiring an explicit category on every cancellation (instead
 * of silently defaulting to "guest cancelled") is what makes the commission
 * rule enforceable at all.
 */
function CancelOrRemoveModal({
  state, onClose, onConfirm,
}: {
  state: { booking: Booking; mode: "cancel" | "remove" } | null;
  onClose: () => void;
  onConfirm: (id: string, category: CancelCategory, reason: string) => Promise<boolean>;
}) {
  const [category, setCategory] = useState<CancelCategory>("guestCancelled");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset to a clean slate every time a different booking (or a different
  // mode on the same booking) is opened.
  useEffect(() => {
    setCategory(state?.mode === "remove" ? "bookerConfusion" : "guestCancelled");
    setReason("");
  }, [state?.booking.id, state?.mode]);

  if (!state) return null;
  const { booking } = state;

  async function submit() {
    if (!reason.trim()) return;
    setSaving(true);
    const ok = await onConfirm(booking.id, category, reason.trim());
    setSaving(false);
    if (!ok) return;
  }

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={state.mode === "remove" ? "Remove booking" : "Cancel booking"}
      sub={`${booking.guests.join(", ") || "Guest"} · ${formatUnitDisplay(booking.unit.unitNumber)}`}
      maxWidth={480}
      footer={
        <>
          <button onClick={onClose} className="btn">Never mind</button>
          <button onClick={submit} disabled={saving || !reason.trim()} className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : state.mode === "remove" ? "Remove booking" : "Cancel booking"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-[var(--gray)]">
        Every cancellation needs a category — it decides whether the booker keeps their commission on this booking.
        This frees the unit on the calendar immediately either way.
      </p>
      <div className="mb-3 space-y-2">
        {CANCEL_CATEGORY_OPTIONS.map((opt) => (
          <label key={opt.value} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border p-3", category === opt.value ? "border-rausch bg-rausch/5" : "border-[var(--line)]")}>
            <input type="radio" name="cancel-category" className="mt-0.5" checked={category === opt.value} onChange={() => setCategory(opt.value)} />
            <span>
              <span className="block text-[13.5px] font-bold">{opt.label}</span>
              <span className="block text-[12px] text-[var(--gray)]">{opt.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="field-label">Reason *</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="A few words on what happened — shown in the booking's audit trail."
        className="field-input mt-1.5 min-h-[64px] resize-y"
      />
    </Modal>
  );
}

/** A booking is past due once its check-in date has already passed while the
 * balance is still unpaid — the guest should have settled up by check-in at
 * the latest. Distinct from "Paid"/"Unpaid" (which says nothing about
 * timing) so staff can tell an on-schedule unpaid booking from one that's
 * actually overdue. */
function isPastDue(b: Booking) {
  return !b.cancelledAt && !b.paid && dayOf(new Date(b.date)) < dayOf(new Date());
}

/** Stay-lifecycle bucket for the Bookings-page quick tabs — reuses the same
 * fields/effectiveRange logic "Today's occupancy" already relies on, so a
 * booking's bucket here always agrees with what that card shows. Order
 * matters: cancelled and an explicit checkedOutAt both short-circuit before
 * date-math even runs. */
function lifecycleStatus(b: Booking, todayIso: string): "cancelled" | "completed" | "active" | "upcoming" {
  if (b.cancelledAt) return "cancelled";
  if (b.checkedOutAt) return "completed";
  const { inIso, outIso } = effectiveRange(b);
  if (b.checkedInAt || (inIso <= todayIso && todayIso < outIso)) return "active";
  if (outIso <= todayIso) return "completed";
  return "upcoming";
}

function BookingLine({
  b, kind, unitColor, isFirstBooking, canEdit, canDelete, onEdit, onCancel, onRefund, onDelete, onRemove, toast,
}: {
  b: Booking;
  kind: "checkin" | "checkout";
  unitColor: { border: string; text: string };
  isFirstBooking: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onRefund: () => void;
  onDelete: () => void;
  onRemove: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const pastDue = isPastDue(b);
  const { inIso, outIso } = effectiveRange(b);
  const totalFee = b.amount + (b.dpAmount ?? 0);
  const canRefund = canEdit && !b.refundedAt && (b.paid || (b.dpAmount ?? 0) > 0);
  return (
    <div
      className={cn(
        "rounded-2xl border border-l-[5px] p-4",
        b.cancelledAt ? "border-[var(--line)] border-l-[var(--gray)] opacity-70" : kind === "checkin" ? "border-[var(--line)] border-l-green" : "border-[var(--line)] border-l-rausch"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-[16px] font-extrabold leading-tight">{b.guests.join(", ") || "Guest"}</span>
          <span className={cn("flex flex-none items-center gap-1 rounded-lg border-2 px-2 py-0.5 text-[13px] font-extrabold", unitColor.border, unitColor.text)}>
            <HomeIcon className="h-3.5 w-3.5" /> {b.unit.unitNumber}
          </span>
          <span className={cn("flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide", kind === "checkin" ? "bg-green/15 text-green" : "bg-rausch/15 text-rausch")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", kind === "checkin" ? "bg-green" : "bg-rausch")} />
            {kind === "checkin" ? "Check-in" : "Check-out"}
          </span>
        </div>
        <div className="flex flex-none items-center gap-1">
          {b.cancelledAt ? (
            <Tag variant="cancelled">{b.cancellationCategory === "bookerConfusion" || b.cancellationCategory === "vipReassignment" ? "Removed" : "Cancelled"}</Tag>
          ) : pastDue ? (
            <Tag variant="unpaid">Past due</Tag>
          ) : b.paid ? (
            <Tag variant="paid">Fully Paid</Tag>
          ) : (
            <Tag variant="unpaid">Unpaid</Tag>
          )}
          {canRefund && (
            <button onClick={onRefund} title="Mark refunded" className="grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-violet/10 hover:text-violet"><RefreshIcon className="h-3.5 w-3.5" /></button>
          )}
          {!b.cancelledAt && canEdit && (
            <button onClick={onRemove} title="Remove — booker confusion or VIP reassignment (not a guest cancellation)" className="grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><AlertIcon className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Tag variant={b.platform.toLowerCase()}>{PLATFORM_LABEL[b.platform] ?? b.platform}</Tag>
        {isFirstBooking && <Tag variant="paid">1st booking</Tag>}
        {b.source === "AIRBNB" && <Tag variant="airbnb">Airbnb import</Tag>}
        {b.refundedAt && <Tag variant="refunded">Refunded</Tag>}
        {b.confirmationNumber && (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[var(--gray)]" title="Booking ID — guest uses this to sign in and unlock this unit's WiFi/door code">
            🔑 {b.confirmationNumber}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(b.confirmationNumber!).then(
                  () => toast("Booking ID copied ✓"),
                  () => toast("Couldn't copy — select and copy manually.", true)
                );
              }}
              title="Copy Booking ID"
              className="grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch active:bg-rausch/15"
            >
              <CopyIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      <div className="mt-2 text-[12px] text-[var(--gray)]">From {fmtDate(inIso, { month: "short", day: "numeric", year: "numeric" })}</div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
        <div><span className="text-[var(--gray)]">Fee </span><span className="font-bold">{peso(totalFee)}</span></div>
        <div>
          <span className="text-[var(--gray)]">In </span>
          <span className="font-bold">{fmtDate(inIso, { month: "short", day: "numeric" })}{b.checkInTime ? ` · ${fmtTimeStr(b.checkInTime)}` : ""}</span>
        </div>
        <div>
          <span className="text-[var(--gray)]">Balance </span>
          <span className={cn("font-bold", b.paid ? "text-green" : "text-rausch")}>{peso(b.paid ? 0 : b.amount)}</span>
        </div>
        <div>
          <span className="text-[var(--gray)]">Out </span>
          <span className="font-bold">{fmtDate(outIso, { month: "short", day: "numeric" })}{b.checkOutTime ? ` · ${fmtTimeStr(b.checkOutTime)}` : ""}</span>
        </div>
        {b.conflict && <div className="flex items-center gap-1 font-bold text-rausch"><span aria-hidden>⚠</span> Conflict</div>}
        <div><span className="text-[var(--gray)]">Booker </span><span className="font-bold">{b.booker?.name ?? (b.platform === "Airbnb" ? "Airbnb booking" : b.platform === "Direct" ? "Direct Booking" : "Unassigned")}</span></div>
        {b.dpReceivedBy && <div><span className="text-[var(--gray)]">DP To </span><span className="font-bold text-blue">{b.dpReceivedBy.name}</span></div>}
        {b.receivedBy && <div><span className="text-[var(--gray)]">FP To </span><span className="font-bold text-blue">{b.receivedBy.name}</span></div>}
      </div>

      {b.notes && <div className="mt-2 text-[11px] text-[var(--gray)]">📝 {b.notes}</div>}
      {b.cancelledAt && b.cancellationReason && (
        <div className="mt-1 text-[11px] italic text-[var(--gray)]">
          {b.cancellationCategory === "bookerConfusion" ? "Removed (booker confusion/duplicate): " : b.cancellationCategory === "vipReassignment" ? "Removed (VIP reassignment): " : "Cancelled: "}
          &ldquo;{b.cancellationReason}&rdquo;
        </div>
      )}
      {b.refundedAt && b.refundReason && <div className="mt-1 text-[11px] italic text-[var(--gray)]">Refunded: &ldquo;{b.refundReason}&rdquo;</div>}

      {(canEdit || canDelete) && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {!b.cancelledAt && canEdit ? (
            <button onClick={onEdit} className="btn-sm btn justify-center"><EditIcon className="h-3.5 w-3.5" /> Edit</button>
          ) : <span />}
          {!b.cancelledAt && canDelete ? (
            <button onClick={onDelete} className="btn-sm flex items-center justify-center gap-1.5 rounded-xl border border-rausch/30 bg-rausch/5 px-3 py-2 text-[12.5px] font-bold text-rausch hover:bg-rausch/10"><TrashIcon className="h-3.5 w-3.5" /> Delete</button>
          ) : <span />}
          {!b.cancelledAt && canEdit ? (
            <button onClick={onCancel} className="btn-sm btn justify-center"><CloseIcon className="h-3.5 w-3.5" /> Cancel</button>
          ) : <span />}
        </div>
      )}
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
      <span className="font-extrabold text-rausch">{formatUnitDisplay(b.unit.unitNumber)}</span>
      <span className="font-bold">{b.guests.join(", ") || "Guest"}</span>
      {b.confirmationNumber && <span className="font-mono text-[12px] font-bold text-[var(--gray)]">🔑 {b.confirmationNumber}</span>}
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
    notes: v.notes || null,
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
    notes: b.notes ?? "",
  };
}
