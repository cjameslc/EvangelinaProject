"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { UploadIcon } from "@/components/ui/Icons";

type BrandKitSettings = {
  logoUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  facebookPageUrl?: string | null;
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
};

const DEFAULT_PRIMARY = "#FF385C";
const DEFAULT_SECONDARY = "#B0203A";

/**
 * Brand Kit — logo, brand colors, and social handles used by the Social
 * Media Center's export pipeline (socialGraphic.ts). Left unset, every
 * consumer falls back to the original static logo / hardcoded rausch
 * colors — this panel exists to make those actually admin-configurable,
 * not to add a required setup step.
 *
 * Deliberately its own PATCH (not folded into SettingsTab's full-object
 * save) — /api/settings validates against settingsSchema.partial() and
 * does a Prisma upsert with only the given keys, so sending just these six
 * fields is safe and can't clobber anything SettingsTab owns.
 */
export function BrandKitTab({ initial, onSaved }: { initial: BrandKitSettings; onSaved?: (s: BrandKitSettings) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    logoUrl: initial.logoUrl ?? null,
    brandPrimaryColor: initial.brandPrimaryColor ?? "",
    brandSecondaryColor: initial.brandSecondaryColor ?? "",
    facebookPageUrl: initial.facebookPageUrl ?? "",
    instagramHandle: initial.instagramHandle ?? "",
    tiktokHandle: initial.tiktokHandle ?? "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Logo is too large (max 4MB)", true); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/settings/logo", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setForm((f) => ({ ...f, logoUrl: j.url }));
    } catch (e: any) {
      toast(e.message ?? "Couldn't upload logo", true);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        logoUrl: form.logoUrl,
        brandPrimaryColor: form.brandPrimaryColor || null,
        brandSecondaryColor: form.brandSecondaryColor || null,
        facebookPageUrl: form.facebookPageUrl || null,
        instagramHandle: form.instagramHandle || null,
        tiktokHandle: form.tiktokHandle || null,
      };
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json();
      onSaved?.(saved);
      toast("Brand Kit saved ✓");
    } catch {
      toast("Couldn't save Brand Kit", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-[14px] font-extrabold">Logo</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Used on every Social Media Center export. Leave blank to use the default logo.</p>
        <div className="flex items-center gap-3">
          <input id="brand-logo" type="file" accept="image/*" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} />
          {form.logoUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.logoUrl} alt="Brand logo" className="h-20 w-20 rounded-full border border-[var(--line)] object-cover" />
              <button onClick={() => setForm((f) => ({ ...f, logoUrl: null }))} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rausch text-[10px] text-white">✕</button>
            </div>
          ) : (
            <label htmlFor="brand-logo" className="grid h-20 w-20 cursor-pointer place-items-center rounded-full border border-dashed border-[var(--line-2)] text-[var(--gray)]">
              {uploading ? <span className="text-[10px] font-bold">…</span> : <UploadIcon className="h-5 w-5" />}
            </label>
          )}
          <label htmlFor="brand-logo" className="btn-sm btn cursor-pointer">{uploading ? "Uploading…" : "Choose image"}</label>
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Brand colors</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Used for the gradient background and badges on exported graphics. Leave blank to use the default rausch pink.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label mb-1.5 block">Primary color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.brandPrimaryColor || DEFAULT_PRIMARY} onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })} className="h-10 w-10 flex-none rounded-lg border border-[var(--line-2)]" />
              <input value={form.brandPrimaryColor} onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })} className="field-input" placeholder={DEFAULT_PRIMARY} />
            </div>
          </div>
          <div>
            <label className="field-label mb-1.5 block">Secondary color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.brandSecondaryColor || DEFAULT_SECONDARY} onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })} className="h-10 w-10 flex-none rounded-lg border border-[var(--line-2)]" />
              <input value={form.brandSecondaryColor} onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })} className="field-input" placeholder={DEFAULT_SECONDARY} />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--line)] pt-4">
        <h3 className="mb-1 text-[14px] font-extrabold">Social platforms</h3>
        <p className="mb-3 text-[12px] text-[var(--gray)]">Stored for reference across the app. Leave blank if not applicable.</p>
        <div className="space-y-2.5">
          <input value={form.facebookPageUrl} onChange={(e) => setForm({ ...form, facebookPageUrl: e.target.value })} className="field-input" placeholder="Facebook page URL" />
          <input value={form.instagramHandle} onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })} className="field-input" placeholder="Instagram handle (e.g. evangelinasstaycation)" />
          <input value={form.tiktokHandle} onChange={(e) => setForm({ ...form, tiktokHandle: e.target.value })} className="field-input" placeholder="TikTok handle" />
        </div>
      </div>

      <button onClick={save} disabled={saving || uploading} className="btn-primary disabled:opacity-60">
        {saving ? "Saving…" : "Save Brand Kit"}
      </button>
    </div>
  );
}
