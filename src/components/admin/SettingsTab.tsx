"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { GUIDEBOOK_CATEGORIES, AMENITIES, HOUSE_RULES, type GuidebookCategory, type Amenity } from "@/lib/guidebookContent";
import { PlusIcon, TrashIcon, UploadIcon } from "@/components/ui/Icons";
import type { EmergencyContact, FaqCategory } from "@/lib/guidebookService";

type Settings = {
  businessName: string; address: string; nightlyRate: number; dpFee: number;
  propertyLat?: number | null; propertyLng?: number | null;
  housekeepingDayRate: number; housekeepingNightBonus: number; bookerCommission: number; auditorWeeklyRate: number;
  weekdayRate12h: number; weekdayRate21h: number; weekendRate12h: number; weekendRate21h: number; weekdayNightPromoPct: number;
  dailyRevenueGoal?: number | null;
  monthlyRevenueTargetPerUnit: number;
  extensionFeePerHour: number; flexibleTimeFee: number; parkingCarRate: number; parkingMotorcycleRate: number;
  celebrationPackagePrice: number; celebrationPackageItems?: string[] | null;
  batteryLowThresholdPct: number; batteryCriticalThresholdPct: number;
  contactPhone?: string | null; emergencyContactPhone?: string | null; messengerUsername?: string | null;
  guidebookCategories?: GuidebookCategory[] | null; amenities?: Amenity[] | null; houseRules?: string[] | null;
  hostName?: string | null; hostPhotoUrl?: string | null; hostBio?: string | null;
  paymentQrUrl?: string | null; paymentInstructions?: string | null;
  emergencyContacts?: EmergencyContact[] | null; staffContacts?: EmergencyContact[] | null; faqs?: FaqCategory[] | null;
};

export function SettingsTab({ initial, onSaved }: { initial: Settings; onSaved?: (s: Settings) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    ...initial,
    contactPhone: initial.contactPhone ?? "",
    emergencyContactPhone: initial.emergencyContactPhone ?? "",
    messengerUsername: initial.messengerUsername ?? "",
    guidebookCategories: initial.guidebookCategories ?? GUIDEBOOK_CATEGORIES,
    amenities: initial.amenities ?? AMENITIES,
    houseRules: initial.houseRules ?? HOUSE_RULES,
    hostName: initial.hostName ?? "",
    hostPhotoUrl: initial.hostPhotoUrl ?? null,
    hostBio: initial.hostBio ?? "",
    paymentQrUrl: initial.paymentQrUrl ?? null,
    paymentInstructions: initial.paymentInstructions ?? "",
    celebrationPackageItems: initial.celebrationPackageItems ?? [],
    emergencyContacts: initial.emergencyContacts ?? [],
    staffContacts: initial.staffContacts ?? [],
    faqs: initial.faqs ?? [],
  });
  const [saving, setSaving] = useState(false);

  async function handleHostPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Photo is too large (max 4MB)", true); return; }
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/settings/host-photo", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error ?? "Couldn't upload photo", true); return; }
    setForm((f) => ({ ...f, hostPhotoUrl: j.url }));
  }

  async function handlePaymentQr(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("QR image is too large (max 4MB)", true); return; }
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/settings/payment-qr", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error ?? "Couldn't upload QR code", true); return; }
    setForm((f) => ({ ...f, paymentQrUrl: j.url }));
  }

  async function save() {
    const numericFields: (keyof Settings)[] = [
      "nightlyRate", "dpFee", "housekeepingDayRate", "housekeepingNightBonus", "bookerCommission", "auditorWeeklyRate",
      "weekdayRate12h", "weekdayRate21h", "weekendRate12h", "weekendRate21h", "weekdayNightPromoPct",
      "extensionFeePerHour", "flexibleTimeFee", "parkingCarRate", "parkingMotorcycleRate", "celebrationPackagePrice",
      "batteryLowThresholdPct", "batteryCriticalThresholdPct", "monthlyRevenueTargetPerUnit",
    ];
    for (const key of numericFields) {
      const v = form[key];
      if (typeof v !== "number" || Number.isNaN(v) || v < 0) { toast(`Enter a valid amount for ${key}`, true); return; }
    }
    // Textareas split on "\n" — trim/drop blank lines so a trailing newline
    // or accidental blank row never becomes an empty string the schema
    // rejects (guidebookCategorySchema/z.string().min(1) items).
    const payload = {
      ...form,
      guidebookCategories: form.guidebookCategories.map((c) => ({ ...c, items: c.items.map((i) => i.trim()).filter(Boolean) })),
      amenities: form.amenities.filter((a) => a.label.trim()),
      houseRules: form.houseRules.map((r) => r.trim()).filter(Boolean),
      celebrationPackageItems: form.celebrationPackageItems.map((i) => i.trim()).filter(Boolean),
      emergencyContacts: form.emergencyContacts
        .map((c) => ({ name: c.name.trim(), phones: c.phones.map((p) => p.trim()).filter(Boolean) }))
        .filter((c) => c.name && c.phones.length > 0),
      staffContacts: form.staffContacts
        .map((c) => ({ name: c.name.trim(), phones: c.phones.map((p) => p.trim()).filter(Boolean) }))
        .filter((c) => c.name && c.phones.length > 0),
      faqs: form.faqs
        .map((cat) => ({ category: cat.category.trim(), items: cat.items.map((i) => ({ q: i.q.trim(), a: i.a.trim() })).filter((i) => i.q && i.a) }))
        .filter((cat) => cat.category && cat.items.length > 0),
    };
    setSaving(true);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save settings", true); return; }
    onSaved?.(payload);
    toast("Settings saved ✓");
  }

  return (
    <div className="card max-w-lg space-y-4 p-5">
      <div>
        <label className="field-label">Business name</label>
        <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className="field-input mt-1.5" />
      </div>
      <div>
        <label className="field-label">Address</label>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="field-input mt-1.5" />
      </div>
      <div>
        <label className="field-label">Property coordinates</label>
        <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">
          Distances on the Nearby pages are measured from this point. Find it on Google Maps: right-click the building → the lat, lng shown at the top is what to paste below.
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          <input
            type="number" step="any" placeholder="Latitude" value={form.propertyLat ?? ""}
            onChange={(e) => setForm({ ...form, propertyLat: e.target.value === "" ? null : Number(e.target.value) })}
            className="field-input"
          />
          <input
            type="number" step="any" placeholder="Longitude" value={form.propertyLng ?? ""}
            onChange={(e) => setForm({ ...form, propertyLng: e.target.value === "" ? null : Number(e.target.value) })}
            className="field-input"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Default nightly rate (₱)</label>
          <input type="number" value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: +e.target.value })} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Default DP fee (₱)</label>
          <input type="number" value={form.dpFee} onChange={(e) => setForm({ ...form, dpFee: +e.target.value })} className="field-input mt-1.5" />
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest booking rates</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">The rate table shown to guests on /book. Applies to every unit — Daycation and Night stay both use the 12-hour rate, Full stay uses the 21-hour rate. Weekend = Fri/Sat/Sun check-in.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Weekday — 12 hrs (₱)</label>
            <input type="number" min={0} value={form.weekdayRate12h} onChange={(e) => setForm({ ...form, weekdayRate12h: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Weekday — 21 hrs (₱)</label>
            <input type="number" min={0} value={form.weekdayRate21h} onChange={(e) => setForm({ ...form, weekdayRate21h: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Weekend — 12 hrs (₱)</label>
            <input type="number" min={0} value={form.weekendRate12h} onChange={(e) => setForm({ ...form, weekendRate12h: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Weekend — 21 hrs (₱)</label>
            <input type="number" min={0} value={form.weekendRate21h} onChange={(e) => setForm({ ...form, weekendRate21h: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Weekday Night-stay promo (%)</label>
            <input type="number" min={0} max={100} value={form.weekdayNightPromoPct} onChange={(e) => setForm({ ...form, weekdayNightPromoPct: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Extension fee (₱/hour)</label>
            <input type="number" min={0} value={form.extensionFeePerHour} onChange={(e) => setForm({ ...form, extensionFeePerHour: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Daily revenue goal (₱, optional)</label>
            <input
              type="number"
              min={0}
              value={form.dailyRevenueGoal ?? ""}
              onChange={(e) => setForm({ ...form, dailyRevenueGoal: e.target.value === "" ? null : +e.target.value })}
              placeholder="Not set"
              className="field-input mt-1.5"
            />
            <p className="mt-1 text-[11px] text-[var(--gray)]">Powers the progress bar on Bookings → Revenue Opportunities. Leave blank to hide it.</p>
          </div>
          <div>
            <label className="field-label">Monthly revenue target per unit (₱)</label>
            <input
              type="number"
              min={1}
              value={form.monthlyRevenueTargetPerUnit}
              onChange={(e) => setForm({ ...form, monthlyRevenueTargetPerUnit: +e.target.value })}
              className="field-input mt-1.5"
            />
            <p className="mt-1 text-[11px] text-[var(--gray)]">Default monthly goal shown on Dashboard/Analytics for every unit — override an individual unit&rsquo;s target from the Units tab.</p>
          </div>
          <div>
            <label className="field-label">Flexible time fee (₱)</label>
            <input type="number" min={0} value={form.flexibleTimeFee} onChange={(e) => setForm({ ...form, flexibleTimeFee: +e.target.value })} className="field-input mt-1.5" />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest payment</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">
          Shown during the guest booking flow&rsquo;s payment step — a real QR code (GCash/bank scan-to-pay) a guest can actually pay against, instead of just an amount with no way to act on it. Leave blank to keep the payment step upload-only, with no QR shown.
        </p>
        <div className="flex gap-4">
          <div className="flex-none">
            <input id="payment-qr" type="file" accept="image/*" className="hidden" onChange={(e) => handlePaymentQr(e.target.files?.[0])} />
            {form.paymentQrUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.paymentQrUrl} alt="Payment QR code" className="h-28 w-28 rounded-xl border border-[var(--line)] object-cover" />
                <button onClick={() => setForm((f) => ({ ...f, paymentQrUrl: null }))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rausch text-[10px] text-white">✕</button>
              </div>
            ) : (
              <label htmlFor="payment-qr" className="grid h-28 w-28 cursor-pointer place-items-center rounded-xl border border-dashed border-[var(--line-2)] text-[var(--gray)]">
                <UploadIcon className="h-5 w-5" />
              </label>
            )}
            <label htmlFor="payment-qr" className="btn-sm btn mt-2 block cursor-pointer text-center">Choose image</label>
          </div>
          <div className="flex-1">
            <label className="field-label">Payment instructions (optional)</label>
            <textarea
              value={form.paymentInstructions}
              onChange={(e) => setForm({ ...form, paymentInstructions: e.target.value })}
              className="field-input mt-1.5 min-h-[100px]"
              placeholder={"e.g. GCash: 0912 345 6789 (Juan Dela Cruz)\nPlease include your confirmation number in the payment note."}
            />
            <p className="mt-1 text-[11px] text-[var(--gray)]">Shown under the QR code — account name/number, or any note a guest paying should see.</p>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Battery health thresholds</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Drives the Dashboard&rsquo;s Battery Health widget, unit badges, and &ldquo;Needs your attention&rdquo; alerts. Above Low = Healthy.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Low battery at or below (%)</label>
            <input type="number" min={0} max={100} value={form.batteryLowThresholdPct} onChange={(e) => setForm({ ...form, batteryLowThresholdPct: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Critical battery at or below (%)</label>
            <input type="number" min={0} max={100} value={form.batteryCriticalThresholdPct} onChange={(e) => setForm({ ...form, batteryCriticalThresholdPct: +e.target.value })} className="field-input mt-1.5" />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Parking</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Paid parking, advance reservation required — shown on the Guest Experience Parking page.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Car (₱)</label>
            <input type="number" min={0} value={form.parkingCarRate} onChange={(e) => setForm({ ...form, parkingCarRate: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Motorcycle (₱)</label>
            <input type="number" min={0} value={form.parkingMotorcycleRate} onChange={(e) => setForm({ ...form, parkingMotorcycleRate: +e.target.value })} className="field-input mt-1.5" />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Celebration package</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Birthday/anniversary setup — shown on Rates and in the FAQs.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Package price (₱)</label>
            <input type="number" min={0} value={form.celebrationPackagePrice} onChange={(e) => setForm({ ...form, celebrationPackagePrice: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Items included (one per line)</label>
            <textarea
              value={form.celebrationPackageItems.join("\n")}
              onChange={(e) => setForm({ ...form, celebrationPackageItems: e.target.value.split("\n") })}
              className="field-input mt-1.5 min-h-[64px]"
              placeholder="Banner&#10;Balloons&#10;Cake"
            />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Payroll rates</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Used by the &ldquo;Your team&rdquo; payroll formula on the Dashboard and My Earnings.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Housekeeping — per day (₱)</label>
            <input type="number" min={0} value={form.housekeepingDayRate} onChange={(e) => setForm({ ...form, housekeepingDayRate: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Housekeeping — night-clean bonus (₱)</label>
            <input type="number" min={0} value={form.housekeepingNightBonus} onChange={(e) => setForm({ ...form, housekeepingNightBonus: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Booker — per booking (₱)</label>
            <input type="number" min={0} value={form.bookerCommission} onChange={(e) => setForm({ ...form, bookerCommission: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Auditor — flat weekly rate (₱)</label>
            <input type="number" min={0} value={form.auditorWeeklyRate} onChange={(e) => setForm({ ...form, auditorWeeklyRate: +e.target.value })} className="field-input mt-1.5" />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — meet your host</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">A personal welcome card in the Digital Guidebook. Leave blank to hide it — never shown with placeholder text.</p>
        <div className="flex gap-3">
          <div className="flex-none">
            <input id="host-photo" type="file" accept="image/*" className="hidden" onChange={(e) => handleHostPhoto(e.target.files?.[0])} />
            {form.hostPhotoUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.hostPhotoUrl} alt="Host" className="h-20 w-20 rounded-full object-cover" />
                <button onClick={() => setForm((f) => ({ ...f, hostPhotoUrl: null }))} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rausch text-[10px] text-white">✕</button>
              </div>
            ) : (
              <label htmlFor="host-photo" className="grid h-20 w-20 cursor-pointer place-items-center rounded-full border border-dashed border-[var(--line-2)] text-[var(--gray)]">
                <UploadIcon className="h-5 w-5" />
              </label>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input value={form.hostName} onChange={(e) => setForm({ ...form, hostName: e.target.value })} className="field-input" placeholder="Host name" />
            <textarea value={form.hostBio} onChange={(e) => setForm({ ...form, hostBio: e.target.value })} className="field-input min-h-[60px]" placeholder="A short personal welcome message…" />
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — contact channels</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Powers the Digital Guidebook&rsquo;s Contact host / Emergency / Message us buttons. Left blank hides that button rather than showing a placeholder.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Host contact number</label>
            <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="field-input mt-1.5" placeholder="+63 9XX XXX XXXX" />
          </div>
          <div>
            <label className="field-label">Emergency contact number</label>
            <input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className="field-input mt-1.5" placeholder="+63 9XX XXX XXXX" />
          </div>
          <div className="col-span-2">
            <label className="field-label">Messenger username</label>
            <input value={form.messengerUsername} onChange={(e) => setForm({ ...form, messengerUsername: e.target.value })} className="field-input mt-1.5" placeholder="EvangelinasStaycation (the part after m.me/)" />
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — amenities</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Shown in every unit&rsquo;s Digital Guidebook.</p>
        <div className="space-y-2">
          {form.amenities.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={a.icon} onChange={(e) => setForm({ ...form, amenities: form.amenities.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })} className="field-input w-14 text-center" placeholder="🛏️" />
              <input value={a.label} onChange={(e) => setForm({ ...form, amenities: form.amenities.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="field-input flex-1" placeholder="Amenity name" />
              <button onClick={() => setForm({ ...form, amenities: form.amenities.filter((_, j) => j !== i) })} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setForm({ ...form, amenities: [...form.amenities, { icon: "✨", label: "" }] })} className="btn-sm btn"><PlusIcon className="h-3.5 w-3.5" /> Add amenity</button>
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — nearby places</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">One place per line within each category — these power the Digital Guidebook and the AI Concierge&rsquo;s neighborhood answers.</p>
        <div className="space-y-3">
          {form.guidebookCategories.map((c, i) => (
            <div key={c.key}>
              <label className="field-label">{c.icon} {c.label}</label>
              <textarea
                value={c.items.join("\n")}
                onChange={(e) => setForm({
                  ...form,
                  guidebookCategories: form.guidebookCategories.map((x, j) => (j === i ? { ...x, items: e.target.value.split("\n") } : x)),
                })}
                className="field-input mt-1.5 min-h-[64px]"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — house rules</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">One rule per line. Empty by default — nothing shows until you add rules here.</p>
        <textarea
          value={form.houseRules.join("\n")}
          onChange={(e) => setForm({ ...form, houseRules: e.target.value.split("\n") })}
          className="field-input min-h-[80px]"
          placeholder="e.g. No smoking inside the unit&#10;Quiet hours after 10 PM"
        />
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — emergency contacts</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Named contacts, each with one or more numbers — shown as tap-to-call cards on the Emergency page.</p>
        <div className="space-y-3">
          {form.emergencyContacts.map((c, i) => (
            <div key={i} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={c.name}
                  onChange={(e) => setForm({ ...form, emergencyContacts: form.emergencyContacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  className="field-input flex-1"
                  placeholder="Name (e.g. Housekeeping)"
                />
                <button onClick={() => setForm({ ...form, emergencyContacts: form.emergencyContacts.filter((_, j) => j !== i) })} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
              </div>
              <textarea
                value={c.phones.join("\n")}
                onChange={(e) => setForm({ ...form, emergencyContacts: form.emergencyContacts.map((x, j) => (j === i ? { ...x, phones: e.target.value.split("\n") } : x)) })}
                className="field-input mt-2 min-h-[48px]"
                placeholder="One number per line"
              />
            </div>
          ))}
          <button onClick={() => setForm({ ...form, emergencyContacts: [...form.emergencyContacts, { name: "", phones: [] }] })} className="btn-sm btn"><PlusIcon className="h-3.5 w-3.5" /> Add contact</button>
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — Contact Us staff numbers</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Named staff, each with one or more numbers — shown as tap-to-call cards on the Contact Us page, alongside the main host number.</p>
        <div className="space-y-3">
          {form.staffContacts.map((c, i) => (
            <div key={i} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={c.name}
                  onChange={(e) => setForm({ ...form, staffContacts: form.staffContacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  className="field-input flex-1"
                  placeholder="Name (e.g. Housekeeping)"
                />
                <button onClick={() => setForm({ ...form, staffContacts: form.staffContacts.filter((_, j) => j !== i) })} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
              </div>
              <textarea
                value={c.phones.join("\n")}
                onChange={(e) => setForm({ ...form, staffContacts: form.staffContacts.map((x, j) => (j === i ? { ...x, phones: e.target.value.split("\n") } : x)) })}
                className="field-input mt-2 min-h-[48px]"
                placeholder="One number per line"
              />
            </div>
          ))}
          <button onClick={() => setForm({ ...form, staffContacts: [...form.staffContacts, { name: "", phones: [] }] })} className="btn-sm btn"><PlusIcon className="h-3.5 w-3.5" /> Add contact</button>
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Guest Experience — FAQs</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Grouped into categories — shown as a searchable accordion on the FAQs page.</p>
        <div className="space-y-4">
          {form.faqs.map((cat, ci) => (
            <div key={ci} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={cat.category}
                  onChange={(e) => setForm({ ...form, faqs: form.faqs.map((x, j) => (j === ci ? { ...x, category: e.target.value } : x)) })}
                  className="field-input flex-1 font-bold"
                  placeholder="Category (e.g. Booking & Security)"
                />
                <button onClick={() => setForm({ ...form, faqs: form.faqs.filter((_, j) => j !== ci) })} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 space-y-2">
                {cat.items.map((item, ii) => (
                  <div key={ii} className="space-y-1 rounded-lg bg-[var(--bg-2)] p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={item.q}
                        onChange={(e) => setForm({
                          ...form,
                          faqs: form.faqs.map((x, j) => (j === ci ? { ...x, items: x.items.map((y, k) => (k === ii ? { ...y, q: e.target.value } : y)) } : x)),
                        })}
                        className="field-input flex-1"
                        placeholder="Question"
                      />
                      <button
                        onClick={() => setForm({ ...form, faqs: form.faqs.map((x, j) => (j === ci ? { ...x, items: x.items.filter((_, k) => k !== ii) } : x)) })}
                        className="grid h-9 w-9 flex-none place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"
                      ><TrashIcon className="h-4 w-4" /></button>
                    </div>
                    <textarea
                      value={item.a}
                      onChange={(e) => setForm({
                        ...form,
                        faqs: form.faqs.map((x, j) => (j === ci ? { ...x, items: x.items.map((y, k) => (k === ii ? { ...y, a: e.target.value } : y)) } : x)),
                      })}
                      className="field-input min-h-[48px]"
                      placeholder="Answer"
                    />
                  </div>
                ))}
                <button
                  onClick={() => setForm({ ...form, faqs: form.faqs.map((x, j) => (j === ci ? { ...x, items: [...x.items, { q: "", a: "" }] } : x)) })}
                  className="btn-sm btn"
                ><PlusIcon className="h-3.5 w-3.5" /> Add question</button>
              </div>
            </div>
          ))}
          <button onClick={() => setForm({ ...form, faqs: [...form.faqs, { category: "", items: [] }] })} className="btn-sm btn"><PlusIcon className="h-3.5 w-3.5" /> Add category</button>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save settings"}</button>
    </div>
  );
}
