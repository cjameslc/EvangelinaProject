"use client";

import { cn } from "@/lib/utils";
import { CheckIcon, AlertIcon } from "@/components/ui/Icons";
import type { ExportToggles } from "./ExportPanel";

export type DesignReviewInput = {
  captionLength: number | null; // null = no caption generated yet
  hiddenDateCount: number;
  toggles: ExportToggles;
  isTallFormat: boolean; // Story/TikTok-style — less horizontal room, more vertical stacking risk
};

type Row = { label: string; ok: boolean; note: string };

const MAX_CAPTION_CHARS = 600; // generous — well past what any of this app's platform guidances ask for

function buildRows(input: DesignReviewInput): Row[] {
  const rows: Row[] = [];

  rows.push(
    input.hiddenDateCount > 0
      ? { label: "Date list fits", ok: false, note: `${input.hiddenDateCount} date${input.hiddenDateCount === 1 ? "" : "s"} won't fit and will be summarized as "+${input.hiddenDateCount} more" — trim the list or switch to a taller format.` }
      : { label: "Date list fits", ok: true, note: "Every date line fits without truncation." }
  );

  if (input.captionLength !== null) {
    rows.push(
      input.captionLength > MAX_CAPTION_CHARS
        ? { label: "Caption length", ok: false, note: `${input.captionLength} characters is long for a social caption — consider shortening.` }
        : { label: "Caption length", ok: true, note: `${input.captionLength} characters — reads comfortably.` }
    );
  }

  const overlayCount = [input.toggles.includeLogo, input.toggles.includeWatermark, input.toggles.includeQr].filter(Boolean).length;
  rows.push(
    overlayCount >= 3 && input.isTallFormat
      ? { label: "Overlay crowding", ok: false, note: "Logo, watermark, and QR code are all on in a tall format — corners get tight. Consider turning one off." }
      : { label: "Overlay crowding", ok: true, note: overlayCount === 0 ? "No overlays — clean image." : "Overlays have enough room." }
  );

  return rows;
}

/**
 * A deterministic pass/fail checklist read directly off the real inputs
 * (the same hiddenDateCount the draw functions themselves report, the
 * actual generated caption's length, the actual toggle state) — not an AI
 * vision analysis of the rendered pixels. Matches this codebase's existing
 * "rule-based, explicitly not AI" pattern already used for the Content
 * Studio's marketing suggestions (socialOpportunity.ts's
 * computeMarketingSuggestions).
 */
export function DesignReviewChecklist(input: DesignReviewInput) {
  const rows = buildRows(input);
  const allOk = rows.every((r) => r.ok);

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Design review</span>
        <span className={cn("text-[11px] font-bold", allOk ? "text-green" : "text-amber")}>{allOk ? "Ready to export" : "Worth a look"}</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2 text-[12.5px]">
            {r.ok ? <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-green" /> : <AlertIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-amber" />}
            <span><span className="font-bold">{r.label}.</span> <span className="text-[var(--gray)]">{r.note}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
