"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon, EditIcon, TrashIcon, UploadIcon } from "@/components/ui/Icons";
import { peso } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { fileToDataUrl } from "@/lib/file";

type OwnerCandidate = { id: string; name: string; role: string };
type Unit = {
  id: string; name: string; unitNumber: string; shortName: string; location: string; nightlyRate: number; active: boolean;
  rating: number; photoUrl: string | null;
  icalToken: string | null; icalImportUrl: string | null; icalLastSyncAt: string | null; icalLastSyncError: string | null;
  wifiSsid: string | null; wifiPassword: string | null; doorCode: string | null; checkInInstructions: string | null; videoTutorialUrl: string | null;
  owners?: { user: { id: string; name: string } }[];
};

const EMPTY = {
  name: "", unitNumber: "", shortName: "", location: "Cubao, Araneta City", nightlyRate: 1799, rating: 4.9, photoUrl: null as string | null, ownerUserIds: [] as string[], icalImportUrl: "",
  wifiSsid: "", wifiPassword: "", doorCode: "", checkInInstructions: "", videoTutorialUrl: "",
};

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
    if (!confirm("Delete this unit? Units with any booking, bill, or cleaning-log history can't be deleted — that history has to be cleared first.")) return;
    const res = await fetch(`/api/units/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      toast(j?.error ?? "Couldn't delete unit", true);
      return;
    }
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
          <div key={u.id} className="card overflow-hidden">
            {u.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.photoUrl} alt={u.name} className="h-32 w-full object-cover" />
            ) : (
              <div className="flex h-32 items-center justify-center bg-gradient-to-br from-rausch/15 to-violet/10 text-3xl">🏠</div>
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="w-fit rounded-md bg-rausch/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-rausch">unit {u.unitNumber}</span>
                  <h3 className="mt-1 text-[14.5px] font-extrabold leading-tight">{u.name}</h3>
                </div>
                <div className="flex flex-none gap-1">
                  <button onClick={() => setModal({ unit: u })} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"><EditIcon className="h-4 w-4" /></button>
                  <button onClick={() => remove(u.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
                </div>
              </div>
              <p className="mt-1.5 text-[12px] text-[var(--gray)]">{u.location}</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[15px] font-extrabold">{peso(u.nightlyRate)} <span className="text-[12px] font-semibold text-[var(--gray)]">/ night</span></p>
                <span className="text-[13px] font-bold text-amber">★ {u.rating.toFixed(1)}</span>
              </div>
              <p className="mt-1.5 text-[11.5px] text-[var(--gray)]">
                Owner{(u.owners?.length ?? 0) !== 1 ? "s" : ""}: {u.owners?.length ? u.owners.map((o) => o.user.name).join(", ") : "none assigned — visible to admin only"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {modal && <UnitModal unit={modal.unit} ownerCandidates={ownerCandidates} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function UnitModal({ unit, ownerCandidates, onClose, onSave }: { unit?: Unit; ownerCandidates: OwnerCandidate[]; onClose: () => void; onSave: (v: typeof EMPTY, id?: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(
    unit
      ? {
          name: unit.name, unitNumber: unit.unitNumber, shortName: unit.shortName, location: unit.location, nightlyRate: unit.nightlyRate, rating: unit.rating, photoUrl: unit.photoUrl, ownerUserIds: (unit.owners ?? []).map((o) => o.user.id), icalImportUrl: unit.icalImportUrl ?? "",
          wifiSsid: unit.wifiSsid ?? "", wifiPassword: unit.wifiPassword ?? "", doorCode: unit.doorCode ?? "", checkInInstructions: unit.checkInInstructions ?? "", videoTutorialUrl: unit.videoTutorialUrl ?? "",
        }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [icalToken, setIcalToken] = useState(unit?.icalToken ?? null);
  const [regenerating, setRegenerating] = useState(false);

  const exportUrl = icalToken && typeof window !== "undefined" ? `${window.location.origin}/api/ical/${icalToken}.ics` : "";

  async function copyExportLink() {
    if (!exportUrl) return;
    await navigator.clipboard.writeText(exportUrl);
    toast("Export link copied ✓");
  }

  async function regenerateLink() {
    if (!unit) return;
    if (!confirm("Regenerate this unit's export link? The old link will stop working immediately — you'll need to update it wherever it's pasted (e.g. Airbnb).")) return;
    setRegenerating(true);
    const res = await fetch(`/api/units/${unit.id}/ical-regenerate`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setRegenerating(false);
    if (!res.ok) { toast(j.error ?? "Couldn't regenerate the link", true); return; }
    setIcalToken(j.icalToken);
    toast("Export link regenerated ✓ — the old link no longer works");
  }

  async function syncNow() {
    if (!unit) return;
    setSyncing(true);
    const res = await fetch(`/api/units/${unit.id}/ical-sync`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok || !j.ok) { toast(j.error ?? "Sync failed", true); return; }
    toast(`Synced ✓ ${j.imported} new, ${j.updated} updated, ${j.removed} removed${j.conflicts ? `, ${j.conflicts} conflicts` : ""}`);
  }

  async function submit() {
    setSaving(true);
    await onSave(form, unit?.id);
    setSaving(false);
  }

  function toggleOwner(id: string) {
    setForm((f) => ({ ...f, ownerUserIds: f.ownerUserIds.includes(id) ? f.ownerUserIds.filter((o) => o !== id) : [...f.ownerUserIds, id] }));
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Photo is too large (max 4MB)", true); return; }
    const dataUrl = await fileToDataUrl(file);
    setForm((f) => ({ ...f, photoUrl: dataUrl }));
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Nightly rate (₱)</label>
            <input type="number" value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: +e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Rating (0–5)</label>
            <input type="number" min={0} max={5} step={0.1} value={form.rating} onChange={(e) => setForm({ ...form, rating: +e.target.value })} className="field-input mt-1.5" />
          </div>
        </div>
        <div>
          <label className="field-label">Listing photo</label>
          <p className="mt-0.5 text-[12px] text-[var(--gray)]">Shown on the Dashboard&rsquo;s &ldquo;Your listings&rdquo; cards.</p>
          <div className="mt-1.5 rounded-2xl border border-dashed border-[var(--line-2)] p-3">
            <input id="unit-photo" type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
            {!form.photoUrl ? (
              <label htmlFor="unit-photo" className="flex cursor-pointer flex-col items-center gap-2 py-6 text-center text-[13px] font-semibold text-[var(--gray)]">
                <UploadIcon className="h-6 w-6" />
                Tap to upload a listing photo
              </label>
            ) : (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.photoUrl} alt="Unit" className="max-h-40 w-full rounded-xl object-cover" />
                <button onClick={() => setForm((f) => ({ ...f, photoUrl: null }))} className="btn-sm btn-ghost mt-2">Remove photo</button>
              </div>
            )}
          </div>
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

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <label className="field-label">Airbnb calendar sync</label>
          <p className="mt-0.5 text-[12px] text-[var(--gray)]">Keep this unit&rsquo;s availability in sync with Airbnb using iCal (.ics).</p>

          <div className="mt-3">
            <label className="field-label">Airbnb Import URL (.ics)</label>
            <input
              value={form.icalImportUrl}
              onChange={(e) => setForm({ ...form, icalImportUrl: e.target.value })}
              className="field-input mt-1.5"
              placeholder="https://www.airbnb.com/calendar/ical/xxxxx.ics?s=xxxxx"
            />
            {unit?.icalLastSyncAt && (
              <p className="mt-1 text-[11.5px] text-[var(--gray)]">
                Last synced {new Date(unit.icalLastSyncAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            )}
            {unit?.icalLastSyncError && (
              <p className="mt-1 text-[11.5px] font-semibold text-rausch">{unit.icalLastSyncError}</p>
            )}
          </div>

          {unit && (
            <div className="mt-3">
              <label className="field-label">Export Calendar URL (.ics)</label>
              <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">Paste this into Airbnb (or any OTA) as an external calendar so it always sees this unit&rsquo;s live availability.</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <input readOnly value={exportUrl} className="field-input flex-1" onFocus={(e) => e.target.select()} />
                <button type="button" onClick={copyExportLink} className="btn-sm btn">Copy link</button>
                <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="btn-sm btn">Open link</a>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={syncNow} disabled={syncing || !form.icalImportUrl} className="btn-sm btn">
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
                <button type="button" onClick={regenerateLink} disabled={regenerating} className="btn-sm btn-ghost !text-rausch">
                  {regenerating ? "Regenerating…" : "Regenerate link"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <label className="field-label">Digital Guidebook — check-in details</label>
          <p className="mt-0.5 text-[12px] text-[var(--gray)]">Shown only to the guest with an active booking for this unit, in their Guidebook.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">WiFi network name</label>
              <input value={form.wifiSsid} onChange={(e) => setForm({ ...form, wifiSsid: e.target.value })} className="field-input mt-1.5" placeholder="Evangelina_1118" />
            </div>
            <div>
              <label className="field-label">WiFi password</label>
              <input value={form.wifiPassword} onChange={(e) => setForm({ ...form, wifiPassword: e.target.value })} className="field-input mt-1.5" placeholder="••••••••" />
            </div>
          </div>
          <div className="mt-3">
            <label className="field-label">Door code</label>
            <input value={form.doorCode} onChange={(e) => setForm({ ...form, doorCode: e.target.value })} className="field-input mt-1.5" placeholder="1234#" />
          </div>
          <div className="mt-3">
            <label className="field-label">Check-in instructions</label>
            <textarea value={form.checkInInstructions} onChange={(e) => setForm({ ...form, checkInInstructions: e.target.value })} className="field-input mt-1.5 min-h-[72px]" placeholder="e.g. Elevator to 11F, unit is on your left past the fire exit." />
          </div>
          <div className="mt-3">
            <label className="field-label">Check-in video link (optional)</label>
            <input value={form.videoTutorialUrl} onChange={(e) => setForm({ ...form, videoTutorialUrl: e.target.value })} className="field-input mt-1.5" placeholder="https://youtu.be/…" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
