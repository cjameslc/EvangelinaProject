"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon, EditIcon, TrashIcon } from "@/components/ui/Icons";
import { peso } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

type OwnerCandidate = { id: string; name: string; role: string };
type Unit = {
  id: string; name: string; unitNumber: string; shortName: string; location: string; nightlyRate: number; active: boolean;
  owners?: { user: { id: string; name: string } }[];
};

const EMPTY = { name: "", unitNumber: "", shortName: "", location: "Cubao, Araneta City", nightlyRate: 1799, ownerUserIds: [] as string[] };

export function UnitsTab({ units, onUnitsChange, ownerCandidates }: { units: Unit[]; onUnitsChange: (units: Unit[]) => void; ownerCandidates: OwnerCandidate[] }) {
  const toast = useToast();
  const [modal, setModal] = useState<{ unit?: Unit } | null>(null);

  async function refresh() {
    const res = await fetch("/api/units");
    if (res.ok) onUnitsChange(await res.json());
  }

  async function save(form: typeof EMPTY, id?: string) {
    const res = await fetch(id ? `/api/units/${id}` : "/api/units", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { toast("Couldn't save unit", true); return; }
    toast(id ? "Unit updated ✓" : "Unit added ✓");
    setModal(null);
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this unit? This removes its bookings, calendar entries, and housekeeping data too.")) return;
    const res = await fetch(`/api/units/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't delete unit", true); return; }
    toast("Unit deleted");
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13.5px] text-[var(--gray)]">{units.length} units on the platform.</p>
        <button onClick={() => setModal({})} className="btn-primary"><PlusIcon className="h-4 w-4" /> Add unit</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => (
          <div key={u.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="w-fit rounded-md bg-rausch/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-rausch">unit {u.unitNumber}</span>
                <h3 className="mt-1 text-[14.5px] font-extrabold leading-tight">{u.name}</h3>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setModal({ unit: u })} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"><EditIcon className="h-4 w-4" /></button>
                <button onClick={() => remove(u.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="mt-1.5 text-[12px] text-[var(--gray)]">{u.location}</p>
            <p className="mt-2 text-[15px] font-extrabold">{peso(u.nightlyRate)} <span className="text-[12px] font-semibold text-[var(--gray)]">/ night</span></p>
            <p className="mt-1.5 text-[11.5px] text-[var(--gray)]">
              Owner{(u.owners?.length ?? 0) !== 1 ? "s" : ""}: {u.owners?.length ? u.owners.map((o) => o.user.name).join(", ") : "none assigned — visible to admin only"}
            </p>
          </div>
        ))}
      </div>

      {modal && <UnitModal unit={modal.unit} ownerCandidates={ownerCandidates} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function UnitModal({ unit, ownerCandidates, onClose, onSave }: { unit?: Unit; ownerCandidates: OwnerCandidate[]; onClose: () => void; onSave: (v: typeof EMPTY, id?: string) => void }) {
  const [form, setForm] = useState(
    unit
      ? { name: unit.name, unitNumber: unit.unitNumber, shortName: unit.shortName, location: unit.location, nightlyRate: unit.nightlyRate, ownerUserIds: (unit.owners ?? []).map((o) => o.user.id) }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await onSave(form, unit?.id);
    setSaving(false);
  }

  function toggleOwner(id: string) {
    setForm((f) => ({ ...f, ownerUserIds: f.ownerUserIds.includes(id) ? f.ownerUserIds.filter((o) => o !== id) : [...f.ownerUserIds, id] }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={unit ? "Edit unit" : "Add unit"}
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={submit} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Save unit"}</button></>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Full listing name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field-input mt-1.5" placeholder="Evangelina's Comfort Stay" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Unit number</label>
            <input value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} className="field-input mt-1.5" placeholder="1118" />
          </div>
          <div>
            <label className="field-label">Short name</label>
            <input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} className="field-input mt-1.5" placeholder="Comfort Stay" />
          </div>
        </div>
        <div>
          <label className="field-label">Location</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Nightly rate (₱)</label>
          <input type="number" value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: +e.target.value })} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Owner(s)</label>
          <p className="mt-0.5 text-[12px] text-[var(--gray)]">
            Co-owner accounts checked here will only see this unit across the app. Owner/Admin accounts checked here will see it as one of
            their own on their personal Dashboard, but keep full access everywhere regardless. Leave blank for a generic, unassigned unit.
          </p>
          {ownerCandidates.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] text-[var(--gray)]">No co-owner or admin accounts yet — create one in Users &amp; roles first.</p>
          ) : (
            <div className="mt-1.5 space-y-1.5 rounded-xl border border-[var(--line)] p-2.5">
              {ownerCandidates.map((o) => (
                <label key={o.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] font-semibold hover:bg-[var(--bg-2)]">
                  <input type="checkbox" checked={form.ownerUserIds.includes(o.id)} onChange={() => toggleOwner(o.id)} className="h-4 w-4 accent-rausch" />
                  {o.name}
                  <span className="ml-auto text-[11px] font-semibold text-[var(--gray)]">{o.role === "OWNER_ADMIN" ? "Owner/Admin" : "Co-owner"}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
