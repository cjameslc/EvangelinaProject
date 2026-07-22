"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { CloseIcon, AlertIcon } from "@/components/ui/Icons";
import { peso, fmtDate, fmtTimeStr, unitLabel, manilaDayStart } from "@/lib/format";
import { STAY_TYPES, PLATFORMS, PLATFORM_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/constants";

// Airbnb bookings only ever enter the system automatically (iCal import —
// see syncCalendarMirror), never manually, so it's excluded from what staff
// can pick here. "Direct" is excluded too — same real-world thing as
// "Walk-in" for this business, and offering both as separate choices just
// invited inconsistent logging. Both remain valid values elsewhere (the
// Bookings/Calendar platform filters, revenue-by-platform reports) since
// existing bookings already carry them.
const MANUAL_PLATFORMS = PLATFORMS.filter((p) => p !== "Airbnb" && p !== "Direct");
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string; role: string };
type Unit = { id: string; name: string; unitNumber?: string; nightlyRate?: number };

export type BookingFormValue = {
  unitId: string;
  date: string;
  checkOutDate: string;
  stayType: "Daycation" | "Night" | "Full" | "";
  checkInTime: string;
  checkOutTime: string;
  guests: string[];
  pax: number | null;
  contactNumber: string;
  bookerId: string;
  platform: "Airbnb" | "TikTok" | "Facebook" | "WalkIn" | "Direct" | "Other" | "";
  platformOther: string;
  totalAmount: number | null;
  dpAmount: number | null;
  dpReceivedById: string;
  dpMethod: "Cash" | "GCash" | "BankTransfer" | "";
  amount: number | null;
  receivedById: string;
  method: "Cash" | "GCash" | "BankTransfer" | "";
  paid: boolean;
};

const EMPTY: BookingFormValue = {
  unitId: "", date: manilaDayStart().toISOString().slice(0, 10), checkOutDate: "", stayType: "", checkInTime: "", checkOutTime: "", guests: [], pax: null,
  contactNumber: "", bookerId: "", platform: "", platformOther: "",
  totalAmount: null,
  dpAmount: null, dpReceivedById: "", dpMethod: "",
  amount: null, receivedById: "", method: "", paid: false,
};

/** Smart defaults per stay type — Daycation runs same-day 8am-8pm; Night/Full
 * run overnight, check-in 2pm through checkout noon the next day. Matches
 * the Airbnb-style "pick a type, get a sensible schedule" flow; the guest
 * can still freely edit every field afterward. */
function smartSchedule(type: BookingFormValue["stayType"], checkInDate: string) {
  if (type === "Daycation") {
    return { checkInTime: "08:00", checkOutTime: "20:00", checkOutDate: checkInDate };
  }
  if (type === "Night" || type === "Full") {
    const next = new Date(`${checkInDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return { checkInTime: "14:00", checkOutTime: "12:00", checkOutDate: next.toISOString().slice(0, 10) };
  }
  return { checkInTime: "", checkOutTime: "", checkOutDate: "" };
}

/** Formats a guest name as Title Case (first letter of every space-separated
 * word capitalized) so entries stay consistent regardless of how staff type
 * them in — "juan dela cruz" / "JUAN DELA CRUZ" both become "Juan Dela Cruz". */
function titleCase(name: string): string {
  return name
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function addUtcDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingForm({
  units, employees, initial, defaultDpFee, bookingId, onSubmit, onCancel, submitLabel = "Add booking", ownEmployeeId = null, role,
}: {
  units: Unit[];
  employees: Employee[];
  initial?: Partial<BookingFormValue>;
  defaultDpFee?: number;
  /** The booking being edited, if any — excluded from its own conflict check. */
  bookingId?: string;
  /** Return `false` on failure — anything else (including void) counts as
   * success. The form only resets its fields on success, so a failed save
   * (network error, server rejection) never wipes out what staff typed. */
  onSubmit: (v: BookingFormValue) => Promise<boolean | void> | boolean | void;
  onCancel?: () => void;
  submitLabel?: string;
  /** The logged-in user's own Employee id. When creating a brand-new
   * booking (no bookingId) and this is set, the Booker field auto-fills to
   * it and is locked — whoever logs the booking is the booker, not a
   * pickable field. */
  ownEmployeeId?: string | null;
  /** The logged-in user's role. A Booker can only ever be editing their own
   * booking (enforced by canEditSpecificBooking before this form even
   * opens), so the Booker field stays locked on edit too — same as create.
   * Every other role can still reassign the booker when editing. */
  role?: string;
}) {
  const isCreate = !bookingId;
  const lockBooker = !!ownEmployeeId && (isCreate || role === "BOOKER");

  function makeInitialValue(base?: Partial<BookingFormValue>): BookingFormValue {
    return { ...EMPTY, dpAmount: defaultDpFee ?? EMPTY.dpAmount, ...base, ...(lockBooker ? { bookerId: ownEmployeeId! } : null) };
  }

  const [v, setV] = useState<BookingFormValue>(() => makeInitialValue(initial));
  const [guestInput, setGuestInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [extraCharge, setExtraCharge] = useState("");
  // Whether the extension's payment came from the same person/method as the
  // full payment above, or a different one (e.g. original paid GCash, guest
  // hands over cash for the extra hours). "Different" overwrites Received
  // by/Full Payment method above with whoever just took this payment — there's
  // no separate itemized payment record, so the most recent collector is who
  // the booking reflects going forward.
  const [extraSamePayment, setExtraSamePayment] = useState(true);
  const [extraReceivedById, setExtraReceivedById] = useState("");
  const [extraMethod, setExtraMethod] = useState<BookingFormValue["method"]>("");
  const [extraError, setExtraError] = useState("");

  function addExtraCharge() {
    const amt = Number(extraCharge);
    if (!extraCharge || Number.isNaN(amt) || amt <= 0) { setExtraError("Enter a valid amount."); return; }
    if (!extraSamePayment && (!extraReceivedById || !extraMethod)) {
      setExtraError("Choose who received it and how.");
      return;
    }
    setExtraError("");
    setV((s) => ({
      ...s,
      totalAmount: (s.totalAmount ?? 0) + amt,
      ...(extraSamePayment ? null : { receivedById: extraReceivedById, method: extraMethod }),
    }));
    setExtraCharge("");
    setExtraSamePayment(true);
    setExtraReceivedById("");
    setExtraMethod("");
  }
  // Once the guest hand-edits the checkout date/time, stop auto-suggesting
  // it on every check-in date/type change — their edit wins from then on.
  const [checkOutTouched, setCheckOutTouched] = useState(!!initial?.checkOutDate);
  const [conflict, setConflict] = useState(false);
  const [checkingConflict, setCheckingConflict] = useState(false);

  useEffect(() => {
    setV(makeInitialValue(initial));
    setCheckOutTouched(!!initial?.checkOutDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, defaultDpFee]);

  function selectStayType(type: BookingFormValue["stayType"]) {
    const suggestion = smartSchedule(type, v.date || EMPTY.date);
    setV((s) => ({ ...s, stayType: type, ...suggestion }));
    setCheckOutTouched(false);
  }

  // Airbnb has no day-use product — every Airbnb booking is a full 21-hour
  // stay, so picking that platform locks the stay type to "Full" (mirrored
  // server-side in normalizeStayTypeForPlatform so this can't be bypassed
  // via a direct API call either).
  function selectPlatform(p: BookingFormValue["platform"]) {
    if (p === "Airbnb") {
      const suggestion = smartSchedule("Full", v.date || EMPTY.date);
      setV((s) => ({ ...s, platform: p, stayType: "Full", ...suggestion }));
      setCheckOutTouched(false);
    } else {
      set("platform", p);
    }
  }

  function selectCheckInDate(date: string) {
    setV((s) => {
      if (checkOutTouched || !s.stayType) return { ...s, date };
      return { ...s, date, checkOutDate: smartSchedule(s.stayType, date).checkOutDate };
    });
  }

  function clearDates() {
    setV((s) => ({ ...s, date: "", checkOutDate: "" }));
    setCheckOutTouched(false);
  }

  // Live conflict check — same centralized rule the API enforces on submit,
  // so the guest sees the warning before they even try to save.
  useEffect(() => {
    if (!v.unitId || !v.date || !v.stayType) { setConflict(false); return; }
    const controller = new AbortController();
    setCheckingConflict(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ unitId: v.unitId, date: v.date, stayType: v.stayType });
      if (v.checkOutDate) params.set("checkOutDate", v.checkOutDate);
      if (bookingId) params.set("excludeId", bookingId);
      fetch(`/api/bookings/check-conflict?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((j) => setConflict(!!j.conflict))
        .catch(() => {})
        .finally(() => setCheckingConflict(false));
    }, 300);
    return () => { clearTimeout(t); controller.abort(); };
  }, [v.unitId, v.date, v.checkOutDate, v.stayType, bookingId]);

  // Live summary + duration for the "Booking summary" card.
  const unit = units.find((u) => u.id === v.unitId);
  const duration = (() => {
    if (!v.date || !v.stayType) return null;
    if (v.stayType === "Daycation") {
      if (!v.checkInTime || !v.checkOutTime) return null;
      const [ih, im] = v.checkInTime.split(":").map(Number);
      const [oh, om] = v.checkOutTime.split(":").map(Number);
      const hrs = (oh * 60 + om - (ih * 60 + im)) / 60;
      return hrs > 0 ? `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hr${hrs !== 1 ? "s" : ""}` : null;
    }
    const outDate = v.checkOutDate || addUtcDays(v.date, 1);
    const nights = Math.round((new Date(`${outDate}T00:00:00Z`).getTime() - new Date(`${v.date}T00:00:00Z`).getTime()) / 86400000);
    return nights > 0 ? `${nights} night${nights !== 1 ? "s" : ""}` : null;
  })();

  // The remaining-balance amount is always derived from Total − Downpayment,
  // clamped so it never goes negative.
  useEffect(() => {
    if (v.totalAmount == null) return;
    const remaining = Math.max(0, v.totalAmount - (v.dpAmount ?? 0));
    setV((s) => (s.amount === remaining ? s : { ...s, amount: remaining }));
  }, [v.totalAmount, v.dpAmount]);

  function set<K extends keyof BookingFormValue>(key: K, val: BookingFormValue[K]) {
    setV((s) => ({ ...s, [key]: val }));
  }

  function addGuest() {
    const name = titleCase(guestInput.trim().replace(/,$/, ""));
    if (!name) return;
    set("guests", [...v.guests, name]);
    setGuestInput("");
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!v.date) e.date = "Pick a date.";
    if (!v.unitId) e.unitId = "Choose a unit.";
    if (!v.stayType) e.stayType = "Choose a stay type.";
    if (conflict) e.unitId = "This unit is already booked during the selected schedule.";
    if (v.guests.length === 0) e.guests = "Add at least one guest name.";
    if (!v.contactNumber || v.contactNumber.replace(/\D/g, "").length < 10) e.contactNumber = "Enter a valid contact number.";
    if (!v.bookerId) e.bookerId = "Choose the booker.";
    if (!v.platform) e.platform = "Choose a platform.";
    if (!v.totalAmount || v.totalAmount <= 0) e.totalAmount = "Enter the total amount for this stay.";
    // Only required once the full payment is actually marked received — while
    // "Balance pending" is selected, nobody has received anything yet, so
    // forcing a receiver/method here would just be recording a payment that
    // hasn't happened.
    if (v.paid && !v.receivedById) e.receivedById = "Choose who received the money.";
    if (v.paid && !v.method) e.method = "Choose how the full payment was made.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await onSubmit(v);
      if (result !== false) {
        setV(makeInitialValue());
        setGuestInput("");
        setCheckOutTouched(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const err = (k: string) => errors[k] && <span className="mt-1 block text-[12.5px] font-semibold text-rausch">{errors[k]}</span>;

  return (
    <div className="relative space-y-5">
      {saving && (
        <div className="sticky top-0 z-30 -mx-1 -mt-1 mb-1 flex items-center gap-2.5 rounded-2xl bg-[var(--ink)] px-4 py-3 text-[13.5px] font-bold text-[var(--bg)] shadow-card">
          <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-[var(--bg)]/30 border-t-[var(--bg)]" />
          Saving your changes — please wait, this can take a few seconds…
        </div>
      )}
      <fieldset disabled={saving} className="contents">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Dates <span className="text-rausch">*</span></label>
          <div className="mt-1.5">
            <DateRangePicker
              checkIn={v.date}
              checkOut={v.checkOutDate}
              onSelectCheckIn={selectCheckInDate}
              onSelectCheckOut={(iso) => { setCheckOutTouched(!!iso); set("checkOutDate", iso); }}
              onClear={clearDates}
              error={conflict}
            />
          </div>
          {err("date")}
          <p className="mt-1 text-[12px] text-[var(--gray)]">Leave checkout unset for a same-day (Daycation) or next-day (Night/Full) stay — it&rsquo;s auto-suggested from the stay type below. Pick one for multi-night stays.</p>
        </div>

        <div>
          <label className="field-label">Unit <span className="text-rausch">*</span></label>
          <select
            value={v.unitId}
            onChange={(e) => {
              const unitId = e.target.value;
              const unit = units.find((u) => u.id === unitId);
              // Suggest the unit's own rate (set in Admin → Units) as the total,
              // but never clobber a value staff already typed in.
              setV((s) => ({ ...s, unitId, totalAmount: s.totalAmount == null && unit?.nightlyRate ? unit.nightlyRate : s.totalAmount }));
            }}
            className={cn("field-input mt-1.5", conflict && "border-rausch ring-4 ring-rausch/15")}
          >
            <option value="">— Select unit —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
          </select>
          {err("unitId")}
        </div>

        {conflict && (
          <div className="sm:col-span-2 flex items-start gap-2.5 rounded-2xl border border-rausch/30 bg-rausch/5 p-3.5 text-[13px] font-semibold text-rausch">
            <AlertIcon className="h-4 w-4 flex-none translate-y-0.5" />
            This unit is already booked during the selected schedule. Pick a different unit, date, or stay type.
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="field-label">Stay type <span className="text-rausch">*</span></label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(v.platform === "Airbnb" ? (["Full"] as const) : (["Daycation", "Night", "Full"] as const)).map((t) => (
              <Pill key={t} on={v.stayType === t} color={STAY_TYPES[t].color} onClick={() => selectStayType(t)}>
                {STAY_TYPES[t].label} · {STAY_TYPES[t].hrs}
              </Pill>
            ))}
          </div>
          {v.platform === "Airbnb" && <p className="mt-1.5 text-[12px] text-[var(--gray)]">Airbnb has no day-use listings — bookings from this platform are always a 21-Hour stay.</p>}
          {err("stayType")}
        </div>

        {(v.unitId || v.stayType) && (
          <div className="sm:col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
            <div className="mb-2.5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
              Booking summary
              {checkingConflict && <span className="text-[10.5px] font-semibold normal-case text-[var(--gray)]">checking availability…</span>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-4">
              <div>
                <div className="text-[11px] font-bold text-[var(--gray)]">Unit</div>
                <div className="font-extrabold">{unit ? (unit.unitNumber ? `Unit ${unit.unitNumber}` : unit.name) : "—"}</div>
                {unit?.unitNumber && <div className="truncate text-[11.5px] text-[var(--gray)]">{unit.name}</div>}
              </div>
              <div>
                <div className="text-[11px] font-bold text-[var(--gray)]">Type</div>
                <div className="font-extrabold">{v.stayType ? STAY_TYPES[v.stayType].label : "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[var(--gray)]">Check-in</div>
                <div className="font-extrabold">{v.date ? fmtDate(v.date, { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}{v.checkInTime && ` · ${fmtTimeStr(v.checkInTime)}`}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[var(--gray)]">Check-out</div>
                <div className="font-extrabold">
                  {v.checkOutDate ? fmtDate(v.checkOutDate, { month: "short", day: "numeric", timeZone: "UTC" }) : v.stayType === "Daycation" && v.date ? fmtDate(v.date, { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}
                  {v.checkOutTime && ` · ${fmtTimeStr(v.checkOutTime)}`}
                </div>
              </div>
            </div>
            {duration && <div className="mt-2.5 text-[12px] font-bold text-rausch">{duration}</div>}
          </div>
        )}

        <div>
          <label className="field-label">Check-in time</label>
          <div className="mt-1.5">
            <TimePicker value={v.checkInTime} onChange={(t) => set("checkInTime", t)} />
          </div>
        </div>
        <div>
          <label className="field-label">Check-out time</label>
          <div className="mt-1.5">
            <TimePicker value={v.checkOutTime} onChange={(t) => set("checkOutTime", t)} />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Guest name(s) <span className="text-rausch">*</span></label>
          <div className="mt-1.5 flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-field border border-[var(--line-2)] p-1.5 focus-within:border-rausch focus-within:ring-4 focus-within:ring-rausch/15">
            {v.guests.map((g, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-2)] py-1 pl-3 pr-1 text-[13px] font-semibold">
                {g}
                <button type="button" onClick={() => set("guests", v.guests.filter((_, gi) => gi !== i))} className="grid h-5 w-5 place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/15 hover:text-rausch">
                  <CloseIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGuest(); } }}
              onBlur={addGuest}
              placeholder="Type a name, press Enter to add"
              className="min-w-[120px] flex-1 border-0 bg-transparent p-1 text-sm outline-none"
            />
          </div>
          {err("guests")}
        </div>

        <div>
          <label className="field-label">No. of guests</label>
          <input type="number" min={1} value={v.pax ?? ""} onChange={(e) => set("pax", e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="e.g. 2" />
        </div>
        <div>
          <label className="field-label">Contact number <span className="text-rausch">*</span></label>
          <input value={v.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} className="field-input mt-1.5" placeholder="0917 123 4567" />
          {err("contactNumber")}
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Booker <span className="text-rausch">*</span></label>
          {lockBooker ? (
            <>
              <div className="field-input mt-1.5 flex items-center bg-[var(--bg-2)] font-semibold">
                {employees.find((e) => e.id === v.bookerId)?.name ?? "You"}
              </div>
              <p className="mt-1 text-[12px] text-[var(--gray)]">Automatically set to you — whoever logs a booking is its booker.</p>
            </>
          ) : (
            <>
              <select value={v.bookerId} onChange={(e) => set("bookerId", e.target.value)} className="field-input mt-1.5">
                <option value="">— Select —</option>
                {/* Staff whose Admin-assigned role is Booker or Housekeeping —
                    plus the currently selected person even if their role no
                    longer matches, so editing an older booking never silently
                    drops its booker. */}
                {employees.filter((e) => e.role === "BOOKER" || e.role === "HOUSEKEEPING" || e.id === v.bookerId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {err("bookerId")}
            </>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Platform <span className="text-rausch">*</span></label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {/* Editing an older booking already logged as Airbnb or Direct
                still shows its actual value here, even though neither is
                offered as a fresh pick — its value only changes if staff
                deliberately pick something else. */}
            {(MANUAL_PLATFORMS.includes(v.platform as any) || !v.platform ? MANUAL_PLATFORMS : [...MANUAL_PLATFORMS, v.platform]).map((p) => (
              <Pill key={p} on={v.platform === p} onClick={() => selectPlatform(p)}>{PLATFORM_LABEL[p] ?? p}</Pill>
            ))}
          </div>
          {err("platform")}
        </div>
        {v.platform === "Other" && (
          <div className="sm:col-span-2">
            <label className="field-label">Platform name</label>
            <input value={v.platformOther} onChange={(e) => set("platformOther", e.target.value)} className="field-input mt-1.5" placeholder="e.g. Booking.com, walk-in, referral" />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <label className="field-label">Total Amount <span className="text-rausch">*</span></label>
        <input
          type="number"
          value={v.totalAmount ?? ""}
          onChange={(e) => set("totalAmount", e.target.value ? +e.target.value : null)}
          className="field-input mt-1.5 text-[16px] font-extrabold"
          placeholder="1,799"
        />
        <p className="mt-1.5 text-[12px] text-[var(--gray)]">The full price of the stay. The downpayment below is subtracted automatically to work out the remaining balance.</p>
        {err("totalAmount")}
      </div>

      {/* Extend stay / add charge — editing an existing booking only.
          Works the same way regardless of stay type or platform: update the
          checkout date/time above if the guest is staying longer, then add
          whatever extra they owe here — it's added straight onto Total
          Amount so the remaining balance recalculates automatically. */}
      {!isCreate && (
        <div className="rounded-2xl border border-dashed border-violet/40 bg-violet/5 p-4">
          <div className="flex items-center gap-2 text-[13.5px] font-extrabold">
            <span className="h-2.5 w-2.5 rounded-full bg-violet" /> Extend stay / add charge
          </div>
          <p className="mt-1 text-[12px] text-[var(--gray)]">
            Guest extending their hours or staying another day? Update the checkout date/time above, then add what they owe for the extension here — it goes straight onto the Total Amount above.
          </p>
          <div className="mt-3">
            <label className="field-label">Extra amount (₱)</label>
            <input
              type="number"
              min={0}
              value={extraCharge}
              onChange={(e) => setExtraCharge(e.target.value)}
              className="field-input mt-1.5 max-w-[200px]"
              placeholder="e.g. 500"
            />
          </div>

          <div className="mt-3">
            <label className="field-label">Payment for this extra charge</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill on={extraSamePayment} onClick={() => setExtraSamePayment(true)}>Same as full payment</Pill>
              <Pill on={!extraSamePayment} onClick={() => setExtraSamePayment(false)}>Different</Pill>
            </div>
          </div>

          {!extraSamePayment && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">Received by</label>
                <select value={extraReceivedById} onChange={(e) => setExtraReceivedById(e.target.value)} className="field-input mt-1.5">
                  <option value="">— Select —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Payment method</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map((m) => <Pill key={m} on={extraMethod === m} onClick={() => setExtraMethod(m)}>{PAYMENT_METHOD_LABEL[m]}</Pill>)}
                </div>
              </div>
            </div>
          )}

          {extraError && <p className="mt-2 text-[12.5px] font-semibold text-rausch">{extraError}</p>}

          <button
            type="button"
            onClick={addExtraCharge}
            disabled={!extraCharge || Number(extraCharge) <= 0}
            className="btn-sm btn-primary mt-3 disabled:opacity-50"
          >
            Add to total
          </button>
        </div>
      )}

      {/* Downpayment block */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-extrabold">
          <span className="h-2.5 w-2.5 rounded-full bg-amber" /> Downpayment
          <span className="rounded-md bg-amber/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber">₱500 reservation fee</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">DP Amount</label>
            <input type="number" value={v.dpAmount ?? ""} onChange={(e) => set("dpAmount", e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="500" />
          </div>
          <div>
            <label className="field-label">Received by</label>
            <select value={v.dpReceivedById} onChange={(e) => set("dpReceivedById", e.target.value)} className="field-input mt-1.5">
              <option value="">— Select —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">DP Payment method</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => <Pill key={m} on={v.dpMethod === m} onClick={() => set("dpMethod", m)}>{PAYMENT_METHOD_LABEL[m]}</Pill>)}
          </div>
        </div>
      </div>

      {/* Full payment block */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-extrabold">
          <span className="h-2.5 w-2.5 rounded-full bg-green" /> Full payment
          <span className="rounded-md bg-green/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-green">remaining balance</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Remaining balance</label>
            <div className="field-input mt-1.5 flex items-center bg-[var(--bg-2)] text-[15px] font-extrabold">{peso(v.amount ?? 0)}</div>
            <p className="mt-1 text-[11.5px] text-[var(--gray)]">Total minus downpayment, calculated automatically.</p>
          </div>
          <div>
            <label className="field-label">Received by {v.paid && <span className="text-rausch">*</span>}</label>
            <select value={v.receivedById} onChange={(e) => set("receivedById", e.target.value)} className="field-input mt-1.5">
              <option value="">— Select —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {err("receivedById")}
          </div>
        </div>
        <div>
          <label className="field-label">Full Payment method {v.paid && <span className="text-rausch">*</span>}</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => <Pill key={m} on={v.method === m} onClick={() => set("method", m)}>{PAYMENT_METHOD_LABEL[m]}</Pill>)}
          </div>
          {err("method")}
        </div>
        <div>
          <label className="field-label">Full payment status <span className="text-rausch">*</span></label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill on={v.paid} color="#008A05" onClick={() => set("paid", true)}>Fully paid</Pill>
            <Pill on={!v.paid} color="#FF385C" onClick={() => set("paid", false)}>Balance pending</Pill>
          </div>
        </div>
      </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
        <button onClick={submit} disabled={saving || conflict} className="btn-primary order-first sm:order-none disabled:opacity-50">{saving ? "Saving…" : submitLabel}</button>
        {onCancel && <button onClick={onCancel} className="btn-ghost">Cancel</button>}
      </div>
    </div>
  );
}
