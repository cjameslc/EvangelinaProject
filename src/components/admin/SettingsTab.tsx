"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Settings = { businessName: string; address: string; nightlyRate: number; dpFee: number };

export function SettingsTab({ initial }: { initial: Settings }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save settings", true); return; }
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
      <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save settings"}</button>
    </div>
  );
}
