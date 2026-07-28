"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CopyIcon, SparkleIcon, ImageIcon } from "@/components/ui/Icons";
import { PLATFORM_DEFS, STYLE_DEFS, CAPTION_TOGGLES, type PlatformKey, type StyleKey, type CaptionToggleKey } from "@/lib/socialPlatforms";
import { buildImagePrompt } from "@/lib/socialContent";
import type { CaptionGenResult } from "@/lib/ai/captionGenerator";

export type GeneratorUnitContext = {
  unitName: string;
  price: string | null;
  dateLines: string[];
  hasPhoto: boolean;
};

/**
 * The real caption-generation UI (platform/style/toggles → real Gemini call
 * → copy-paste result), extracted from ContentGeneratorPanel so it can live
 * inline in the Content Studio workspace instead of only inside a modal.
 * ContentGeneratorPanel now just wraps this in <Modal> for the one entry
 * point (Captions tab) not yet migrated to the workspace.
 *
 * State resets are keyed on `unitContext` changing (which unit — or
 * property-wide, when null — is selected) rather than a modal `open`
 * boolean, since this component stays mounted the whole time in the
 * workspace.
 */
export function CaptionEditor({
  unitContext, month, availableDatesSummary, businessName, location, contact, amenities, promoNote, bookingLink, toast,
  onResult,
}: {
  unitContext: GeneratorUnitContext | null; // null = generic property-wide post
  month: string;
  availableDatesSummary: string;
  businessName: string;
  location: string;
  contact: string;
  amenities: string[];
  promoNote: string | null;
  bookingLink: string;
  toast: (msg: string, isError?: boolean) => void;
  /** Fired whenever a fresh caption result comes back — lets a sibling
   * Design Review panel read the real generated caption length without
   * this component needing to know Design Review exists. */
  onResult?: (result: CaptionGenResult | null) => void;
}) {
  const [platform, setPlatform] = useState<PlatformKey>("facebook");
  const [style, setStyle] = useState<StyleKey>("promotional");
  const [toggles, setToggles] = useState<Record<CaptionToggleKey, boolean>>(
    () => Object.fromEntries(CAPTION_TOGGLES.map((t) => [t.key, t.defaultOn])) as Record<CaptionToggleKey, boolean>
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptionGenResult | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");

  useEffect(() => {
    setResult(null);
    setError(null);
    onResult?.(null);
    setImagePrompt(
      buildImagePrompt({
        unitName: unitContext?.unitName ?? businessName,
        dateLines: unitContext?.dateLines ?? [],
        businessName,
        hasPhoto: unitContext?.hasPhoto ?? false,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitContext, businessName]);

  function toggle(key: CaptionToggleKey) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`Copied — ${label} ✓`),
      () => toast("Couldn't copy — select and copy manually.", true)
    );
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/social/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryLabel: unitContext ? `${unitContext.unitName} availability` : "Available Dates",
          categoryDescription: unitContext ? "Promoting a specific unit's open dates" : "Promoting this month's availability",
          month,
          // Scoped to this unit's own real open dates when opened from a
          // card — using the generic property-wide summary here caused the
          // caption to say "fully booked" for a unit the card (and the
          // image prompt below) correctly showed had real openings.
          availableDatesSummary: unitContext ? (unitContext.dateLines.length ? unitContext.dateLines.join(", ") : "fully booked") : availableDatesSummary,
          businessName, location, contact,
          platform, style,
          unitName: unitContext?.unitName,
          price: toggles.price ? unitContext?.price ?? undefined : undefined,
          amenities: toggles.amenities && amenities.length ? amenities : undefined,
          promoNote: toggles.promo && promoNote ? promoNote : undefined,
          bookingLink: toggles.bookingLink ? bookingLink : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't generate a caption.");
      setResult(j);
      onResult?.(j);
    } catch (e: any) {
      setError(e.message ?? "Couldn't generate a caption right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="field-label mb-1.5 block">Platform</label>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_DEFS.map((p) => (
            <button key={p.key} onClick={() => setPlatform(p.key)} className={cn("pill", platform === p.key && "on")}>{p.label}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="field-label mb-1.5 block">Style</label>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_DEFS.map((s) => (
            <button key={s.key} onClick={() => setStyle(s.key)} className={cn("pill", style === s.key && "on")}>{s.label}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="field-label mb-1.5 block">Include in caption</label>
        <div className="flex flex-wrap gap-3">
          {CAPTION_TOGGLES.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold">
              <input type="checkbox" checked={toggles[t.key]} onChange={() => toggle(t.key)} />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <button onClick={generate} disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
        <SparkleIcon className="h-4 w-4" /> {loading ? "Writing…" : "Generate caption"}
      </button>
      {error && <p className="text-[13px] font-semibold text-rausch">{error}</p>}
      {result && (
        <div className="rounded-2xl border border-violet/25 bg-violet/5 p-4">
          <p className="font-extrabold">{result.headline}</p>
          <p className="mt-1.5 whitespace-pre-line text-[13.5px]">{result.caption}</p>
          <p className="mt-1.5 text-[13.5px] font-semibold">{result.cta}</p>
          <p className="mt-2 text-[12.5px] text-blue">{result.hashtags.join(" ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => copy(`${result.headline}\n\n${result.caption}\n\n${result.cta}\n\n${result.hashtags.join(" ")}`, "caption")} className="btn-sm btn">
              <CopyIcon className="h-3.5 w-3.5" /> Copy caption
            </button>
            <button onClick={() => copy(result.hashtags.join(" "), "hashtags")} className="btn-sm btn-ghost">
              <CopyIcon className="h-3.5 w-3.5" /> Copy hashtags
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-[var(--line)] pt-4">
        <label className="field-label mb-1.5 flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> AI image prompt (for an external image tool)</label>
        <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} className="field-input min-h-[90px] resize-y text-[12.5px]" />
        <button onClick={() => copy(imagePrompt, "image prompt")} className="btn-sm btn mt-2"><CopyIcon className="h-3.5 w-3.5" /> Copy prompt</button>
      </div>
    </div>
  );
}
