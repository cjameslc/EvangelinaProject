"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { UploadIcon, CloseIcon } from "@/components/ui/Icons";
import { fileToDataUrl } from "@/lib/file";
import { peso } from "@/lib/format";
import { STAY_TYPES, PLATFORMS, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/constants";

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
  cleanerId: string;
  platform: "Airbnb" | "Facebook" | "TikTok" | "Other" | "";
  platformOther: string;
  totalAmount: number | null;
  dpAmount: number | null;
  dpReceivedById: string;
  dpMethod: "Cash" | "GCash" | "BankTransfer" | "";
  dpProofUrl: string | null;
  amount: number | null;
  receivedById: string;
  method: "Cash" | "GCash" | "BankTransfer" | "";
  proofUrl: string | null;
  paid: boolean;
};

const EMPTY: BookingFormValue = {
  unitId: "", date: new Date().toISOString().slice(0, 10), checkOutDate: "", stayType: "", checkInTime: "", checkOutTime: "", guests: [], pax: null,
  contactNumber: "", bookerId: "", cleanerId: "", platform: "", platformOther: "",
  totalAmount: null,
  dpAmount: null, dpReceivedById: "", dpMethod: "", dpProofUrl: null,
  amount: null, receivedById: "", method: "", proofUrl: null, paid: false,
};

export function BookingForm({
  units, employees, initial, defaultDpFee, onSubmit, onCancel, submitLabel = "Add booking",
}: {
  units: Unit[];
  employees: Employee[];
  initial?: Partial<BookingFormValue>;
  defaultDpFee?: number;
  onSubmit: (v: BookingFormValue) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [v, setV] = useState<BookingFormValue>({ ...EMPTY, dpAmount: defaultDpFee ?? EMPTY.dpAmount, ...initial });
  const [guestInput, setGuestInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setV({ ...EMPTY, dpAmount: defaultDpFee ?? EMPTY.dpAmount, ...initial });
  }, [initial, defaultDpFee]);

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
    const name = guestInput.trim().replace(/,$/, "");
    if (!name) return;
    set("guests", [...v.guests, name]);
    setGuestInput("");
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!v.date) e.date = "Pick a date.";
    if (!v.unitId) e.unitId = "Choose a unit.";
    if (!v.stayType) e.stayType = "Choose a stay type.";
    if (v.guests.length === 0) e.guests = "Add at least one guest name.";
    if (!v.contactNumber || v.contactNumber.replace(/\D/g, "").length < 10) e.contactNumber = "Enter a valid contact number.";
    if (!v.bookerId) e.bookerId = "Choose the booker.";
    if (!v.platform) e.platform = "Choose a platform.";
    if (!v.totalAmount || v.totalAmount <= 0) e.totalAmount = "Enter the total amount for this stay.";
    if (!v.receivedById) e.receivedById = "Choose who received the money.";
    if (!v.method) e.method = "Choose how the full payment was made.";
    if (v.paid && !v.proofUrl) e.proofUrl = "Attach the full payment proof.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSubmit(v);
      setV(EMPTY);
    } finally {
      setSaving(false);
    }
  }

  async function handleProof(file: File | undefined, key: "dpProofUrl" | "proofUrl") {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert("Image is too large (max 4MB)."); return; }
    const dataUrl = await fileToDataUrl(file);
    set(key, dataUrl);
  }

  const err = (k: string) => errors[k] && <span className="mt-1 block text-[12.5px] font-semibold text-rausch">{errors[k]}</span>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label">Check-in date <span className="text-rausch">*</span></label>
          <input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} className="field-input mt-1.5" />
          {err("date")}
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
            className="field-input mt-1.5"
          >
            <option value="">— Select unit —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.unitNumber ? `${u.unitNumber} ${u.name}` : u.name}</option>)}
          </select>
          {err("unitId")}
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Check-out date</label>
          <input type="date" value={v.checkOutDate} min={v.date} onChange={(e) => set("checkOutDate", e.target.value)} className="field-input mt-1.5" />
          <p className="mt-1 text-[12px] text-[var(--gray)]">Leave blank for a same-day (Daycation) or next-day (Night/Full) stay. Set this for multi-night stays so the guest still shows as occupying the room on the days in between.</p>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Stay type <span className="text-rausch">*</span></label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(["Daycation", "Night", "Full"] as const).map((t) => (
              <Pill key={t} on={v.stayType === t} color={STAY_TYPES[t].color} onClick={() => set("stayType", t)}>
                {STAY_TYPES[t].label} · {STAY_TYPES[t].hrs}
              </Pill>
            ))}
          </div>
          {err("stayType")}
        </div>

        <div>
          <label className="field-label">Check-in time</label>
          <input type="time" value={v.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Check-out time</label>
          <input type="time" value={v.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} className="field-input mt-1.5" />
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

        <div>
          <label className="field-label">Booker <span className="text-rausch">*</span></label>
          <select value={v.bookerId} onChange={(e) => set("bookerId", e.target.value)} className="field-input mt-1.5">
            <option value="">— Select —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {err("bookerId")}
        </div>
        <div>
          <label className="field-label">Cleaner</label>
          <select value={v.cleanerId} onChange={(e) => set("cleanerId", e.target.value)} className="field-input mt-1.5">
            <option value="">— Assign later —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Platform <span className="text-rausch">*</span></label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => <Pill key={p} on={v.platform === p} onClick={() => set("platform", p)}>{p}</Pill>)}
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
        <ProofUpload label="Screenshot of GCash, bank receipt, or cash acknowledgement." value={v.dpProofUrl} onChange={(f) => handleProof(f, "dpProofUrl")} onRemove={() => set("dpProofUrl", null)} />
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
            <label className="field-label">Received by <span className="text-rausch">*</span></label>
            <select value={v.receivedById} onChange={(e) => set("receivedById", e.target.value)} className="field-input mt-1.5">
              <option value="">— Select —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {err("receivedById")}
          </div>
        </div>
        <div>
          <label className="field-label">Full Payment method <span className="text-rausch">*</span></label>
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
        {v.paid && (
          <ProofUpload label="Upload proof of full payment — GCash / bank receipt or cash acknowledgement." value={v.proofUrl} onChange={(f) => handleProof(f, "proofUrl")} onRemove={() => set("proofUrl", null)} />
        )}
        {err("proofUrl")}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
        <button onClick={submit} disabled={saving} className="btn-primary order-first sm:order-none">{saving ? "Saving…" : submitLabel}</button>
        {onCancel && <button onClick={onCancel} className="btn-ghost">Cancel</button>}
      </div>
    </div>
  );
}

function ProofUpload({ label, value, onChange, onRemove }: { label: string; value: string | null; onChange: (f: File | undefined) => void; onRemove: () => void }) {
  const inputId = "proof-" + Math.random().toString(36).slice(2, 8);

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    onChange(item.getAsFile() ?? undefined);
  }

  return (
    <div
      className="rounded-2xl border border-dashed border-[var(--line-2)] bg-[var(--card)] outline-none focus:border-rausch focus:ring-4 focus:ring-rausch/15"
      tabIndex={0}
      onPaste={handlePaste}
    >
      <input id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files?.[0])} />
      {!value ? (
        <label htmlFor={inputId} className="flex cursor-pointer flex-col items-center gap-2 p-5 text-center text-[13px] font-semibold text-[var(--gray)]">
          <UploadIcon className="h-6 w-6" />
          <span>{label}</span>
          <span className="btn-sm btn mt-1">Choose image</span>
          <span className="text-[11.5px] font-normal text-[var(--gray)]">or click here and press Ctrl+V to paste a screenshot</span>
        </label>
      ) : (
        <div className="flex items-center gap-3 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Proof" className="h-16 w-16 flex-none rounded-lg border border-[var(--line)] object-cover" />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold">Attached</span>
            <div className="flex gap-1.5">
              <label htmlFor={inputId} className="btn-sm btn-ghost cursor-pointer">Replace</label>
              <button type="button" onClick={onRemove} className="btn-sm btn-ghost">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
