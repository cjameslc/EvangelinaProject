"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Settings = {
  businessName: string; address: string; nightlyRate: number; dpFee: number;
  housekeepingDayRate: number; housekeepingNightBonus: number; bookerCommission: number; auditorWeeklyRate: number;
};

export function SettingsTab({ initial, onSaved }: { initial: Settings; onSaved?: (s: Settings) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    const numericFields: (keyof Settings)[] = ["nightlyRate", "dpFee", "housekeepingDayRate", "housekeepingNightBonus", "bookerCommission", "auditorWeeklyRate"];
    for (const key of numericFields) {
      const v = form[key];
      if (typeof v !== "number" || Number.isNaN(v) || v < 0) { toast(`Enter a valid amount for ${key}`, true); return; }
    }
    setSaving(true);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save settings", true); return; }
    onSaved?.(form);
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
      <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save settings"}</button>
    </div>
  );
}
