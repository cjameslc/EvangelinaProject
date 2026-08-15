"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { UploadIcon } from "@/components/ui/Icons";

type OwnerProfile = { businessName: string; logoUrl: string | null };

/**
 * The staycation's own display name + icon — what actually renders in the
 * nav bar for this owner's staff. Deliberately its own PATCH against the
 * `Owner` row (not folded into SettingsTab's Business info card, which
 * writes to the global Settings singleton every owner on the platform
 * currently shares — see PATCH /api/owner-profile's doc comment). Every
 * new owner starts with these values already set from Platform Admin's
 * Create Owner form; this is just where they change them afterward.
 */
export function StaycationProfileTab({ initial, onSaved }: { initial: OwnerProfile; onSaved?: (p: OwnerProfile) => void }) {
  const toast = useToast();
  const { update } = useSession();
  const [form, setForm] = useState<OwnerProfile>({ businessName: initial.businessName, logoUrl: initial.logoUrl });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Icon is too large (max 4MB)", true); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/owner-profile/logo", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setForm((f) => ({ ...f, logoUrl: j.url }));
    } catch (e: any) {
      toast(e.message ?? "Couldn't upload icon", true);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.businessName.trim()) { toast("Enter a staycation name", true); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/owner-profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error ?? "Save failed");
      onSaved?.(saved);
      // Pushes the new name/icon into the live session immediately (see
      // auth.ts's jwt() "update" trigger branch) so the nav bar reflects it
      // right away instead of waiting for the 60s background revalidation.
      await update({ ownerBusinessName: saved.businessName, ownerLogoUrl: saved.logoUrl });
      toast("Staycation profile saved ✓");
    } catch (e: any) {
      toast(e.message ?? "Couldn't save profile", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card max-w-lg space-y-4 p-5">
      <div>
        <label className="field-label">Staycation name</label>
        <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">Shown in the nav bar for you and your staff.</p>
        <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className="field-input mt-1.5" />
      </div>
      <div>
        <label className="field-label">Icon</label>
        <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">Shown next to your staycation name in the nav bar. Leave blank to use the default icon.</p>
        <div className="mt-1.5 flex items-center gap-3">
          <input id="staycation-logo" type="file" accept="image/*" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} />
          {form.logoUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.logoUrl} alt="Staycation icon" className="h-16 w-16 rounded-lg border border-[var(--line)] object-cover" />
              <button onClick={() => setForm((f) => ({ ...f, logoUrl: null }))} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rausch text-[10px] text-white">✕</button>
            </div>
          ) : (
            <label htmlFor="staycation-logo" className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border border-dashed border-[var(--line-2)] text-[var(--gray)]">
              {uploading ? <span className="text-[10px] font-bold">…</span> : <UploadIcon className="h-5 w-5" />}
            </label>
          )}
          <label htmlFor="staycation-logo" className="btn-sm btn cursor-pointer">{uploading ? "Uploading…" : "Choose image"}</label>
        </div>
      </div>
      <button onClick={save} disabled={saving || uploading} className="btn-primary disabled:opacity-60">
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
