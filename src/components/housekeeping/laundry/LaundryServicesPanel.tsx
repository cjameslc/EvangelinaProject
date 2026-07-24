"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { peso } from "@/lib/format";
import type { LaundryServiceRow } from "./types";

const emptyForm = { name: "", description: "", pricePerKg: "", pricePerItem: "", estimatedTurnaroundHours: "24" };

export function LaundryServicesPanel({ services, canEdit, onChanged }: { services: LaundryServiceRow[]; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function createService() {
    if (!form.name.trim()) { toast("Enter a service name", true); return; }
    if (!form.pricePerKg && !form.pricePerItem) { toast("Set a price per kg or per item", true); return; }
    setSaving(true);
    const res = await fetch("/api/housekeeping/laundry/services", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(), description: form.description.trim() || null,
        pricePerKg: form.pricePerKg ? Number(form.pricePerKg) : null,
        pricePerItem: form.pricePerItem ? Number(form.pricePerItem) : null,
        estimatedTurnaroundHours: Number(form.estimatedTurnaroundHours) || 24,
      }),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => null); toast(j?.error ?? "Couldn't add service", true); return; }
    toast("Service added ✓");
    setForm(emptyForm);
    setAdding(false);
    onChanged();
  }

  async function toggleActive(service: LaundryServiceRow) {
    const res = await fetch(`/api/housekeeping/laundry/services/${service.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !service.active }),
    });
    if (!res.ok) { toast("Couldn't update service", true); return; }
    toast(service.active ? "Service deactivated" : "Service activated ✓");
    onChanged();
  }

  return (
    <div className="space-y-3">
      {services.length === 0 && <p className="text-[13px] text-[var(--gray)]">No laundry services configured yet.</p>}
      <div className="space-y-2">
        {services.map((s) => (
          <div key={s.id} className={`rounded-xl border p-3.5 ${s.active ? "border-[var(--line)]" : "border-[var(--line)] opacity-50"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold">{s.name}</span>
              {!s.active && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold uppercase text-[var(--gray)]">Inactive</span>}
              <span className="ml-auto text-[12.5px] text-[var(--gray)]">
                {s.pricePerKg ? `${peso(s.pricePerKg)}/kg` : null}{s.pricePerKg && s.pricePerItem ? " · " : null}{s.pricePerItem ? `${peso(s.pricePerItem)}/item` : null}
                {" · "}~{s.estimatedTurnaroundHours}h
              </span>
              {canEdit && <button onClick={() => toggleActive(s)} className="btn-sm btn flex-none">{s.active ? "Deactivate" : "Activate"}</button>}
            </div>
            {s.description && <p className="mt-1 text-[12.5px] text-[var(--gray)]">{s.description}</p>}
          </div>
        ))}
      </div>

      {canEdit && (
        adding ? (
          <div className="rounded-xl border border-[var(--line)] p-3.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Service name *" className="field-input" />
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="field-input" />
              <input type="number" min={0} value={form.pricePerKg} onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })} placeholder="Price per kg (₱)" className="field-input" />
              <input type="number" min={0} value={form.pricePerItem} onChange={(e) => setForm({ ...form, pricePerItem: e.target.value })} placeholder="Price per item (₱, optional)" className="field-input" />
              <input type="number" min={1} value={form.estimatedTurnaroundHours} onChange={(e) => setForm({ ...form, estimatedTurnaroundHours: e.target.value })} placeholder="Turnaround (hours)" className="field-input" />
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <button onClick={() => { setAdding(false); setForm(emptyForm); }} className="btn-sm btn">Cancel</button>
              <button disabled={saving} onClick={createService} className="btn-primary btn-sm">{saving ? "Saving…" : "Add service"}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="btn-sm btn"><PlusIcon className="h-3.5 w-3.5" /> Add service</button>
        )
      )}
    </div>
  );
}
