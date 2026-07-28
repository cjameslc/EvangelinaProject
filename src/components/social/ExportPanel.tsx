"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DownloadIcon } from "@/components/ui/Icons";
import { GRAPHIC_FORMATS, QUALITY_TIERS, downloadCanvas, exportCanvasAsPdf, type GraphicResult } from "@/lib/socialGraphic";

export type ExportToggles = { includeLogo: boolean; includeWatermark: boolean; includeContact: boolean; includeQr: boolean };
export type ExportFileType = "png" | "jpeg" | "webp" | "pdf";

const FILE_TYPES: { key: ExportFileType; label: string; mime: string; ext: string }[] = [
  { key: "png", label: "PNG", mime: "image/png", ext: "png" },
  { key: "jpeg", label: "JPG", mime: "image/jpeg", ext: "jpg" },
  { key: "webp", label: "WebP", mime: "image/webp", ext: "webp" },
  { key: "pdf", label: "PDF", mime: "application/pdf", ext: "pdf" },
];

/**
 * Generic export UI for any of this app's canvas-drawn social graphics —
 * takes a `render` callback that paints the current design onto a canvas
 * at whatever width/height is set, so this one panel works for both the
 * Content Studio unit graphic and (later) the Available Dates graphic
 * without a second bespoke export UI.
 */
export function ExportPanel({
  render, filenameBase, availableToggles, toggles, onTogglesChange, onReview,
}: {
  render: (canvas: HTMLCanvasElement, toggles: ExportToggles) => GraphicResult | Promise<GraphicResult>;
  filenameBase: string;
  /** Which toggles make sense for this content (e.g. the Available Dates
   * graphic has no per-unit logo concept the same way — caller decides). */
  availableToggles: { logo?: boolean; watermark?: boolean; contact?: boolean; qr?: boolean };
  toggles: ExportToggles;
  onTogglesChange: (t: ExportToggles) => void;
  onReview?: (result: GraphicResult, dims: { width: number; height: number }) => void;
}) {
  const [formatKey, setFormatKey] = useState(GRAPHIC_FORMATS[0].key);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1350);
  const [isCustom, setIsCustom] = useState(false);
  const [qualityKey, setQualityKey] = useState(QUALITY_TIERS[0].key);
  const [fileType, setFileType] = useState<ExportFileType>("png");
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const format = GRAPHIC_FORMATS.find((f) => f.key === formatKey) ?? GRAPHIC_FORMATS[0];
  const quality = QUALITY_TIERS.find((q) => q.key === qualityKey) ?? QUALITY_TIERS[0];
  const baseW = isCustom ? customW : format.width;
  const baseH = isCustom ? customH : format.height;
  const outW = Math.round(baseW * quality.scale);
  const outH = Math.round(baseH * quality.scale);
  // Rough ballpark only (labeled as such below) — real size depends on
  // image content/compression, this is just enough to set expectations
  // between a Standard PNG and an Ultra HD one.
  const estimatedKb = Math.round((outW * outH * (fileType === "png" ? 0.35 : 0.12) * quality.quality) / 1024);

  async function renderPreview() {
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = outW;
    canvas.height = outH;
    const result = await render(canvas, toggles);
    onReview?.(result, { width: outW, height: outH });
  }

  // Live-updating preview — debounced so rapid toggle/slider changes don't
  // thrash re-renders (each render re-loads images via loadImage()).
  useEffect(() => {
    const t = setTimeout(renderPreview, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatKey, customW, customH, isCustom, qualityKey, toggles.includeLogo, toggles.includeWatermark, toggles.includeContact, toggles.includeQr]);

  async function doExport() {
    setExporting(true);
    try {
      const canvas = previewRef.current ?? document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      await render(canvas, toggles);
      const type = FILE_TYPES.find((t) => t.key === fileType)!;
      const filename = `${filenameBase}-${format.key}.${type.ext}`;
      if (fileType === "pdf") {
        await exportCanvasAsPdf(canvas, filename);
      } else {
        downloadCanvas(canvas, filename, type.mime, fileType === "png" ? undefined : quality.quality);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3">
        <div className="mx-auto flex max-h-[220px] items-center justify-center overflow-hidden rounded-xl" style={{ aspectRatio: `${outW} / ${outH}` }}>
          <canvas ref={previewRef} className="h-full w-full object-contain" />
        </div>
        <p className="mt-2 text-center text-[11px] font-semibold text-[var(--gray)]">
          {outW}×{outH}px · ~{estimatedKb >= 1024 ? `${(estimatedKb / 1024).toFixed(1)} MB` : `${estimatedKb} KB`} estimated · {quality.label} quality
        </p>
      </div>

      <div>
        <label className="field-label mb-1.5 block">Resolution</label>
        <div className="flex flex-wrap gap-1.5">
          {GRAPHIC_FORMATS.map((f) => (
            <button key={f.key} onClick={() => { setIsCustom(false); setFormatKey(f.key); }} className={cn("pill", !isCustom && formatKey === f.key && "on")}>
              {f.label}
            </button>
          ))}
          <button onClick={() => setIsCustom(true)} className={cn("pill", isCustom && "on")}>Custom</button>
        </div>
        {isCustom && (
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={100} max={4000} value={customW} onChange={(e) => setCustomW(+e.target.value || 1080)} className="field-input w-24 text-[13px]" />
            <span className="text-[var(--gray)]">×</span>
            <input type="number" min={100} max={4000} value={customH} onChange={(e) => setCustomH(+e.target.value || 1080)} className="field-input w-24 text-[13px]" />
            <span className="text-[12px] text-[var(--gray)]">px</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="field-label mb-1.5 block">Format</label>
          <div className="flex flex-wrap gap-1.5">
            {FILE_TYPES.map((t) => (
              <button key={t.key} onClick={() => setFileType(t.key)} className={cn("pill", fileType === t.key && "on")}>{t.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label mb-1.5 block">Quality</label>
          <div className="flex flex-wrap gap-1.5">
            {QUALITY_TIERS.map((q) => (
              <button key={q.key} onClick={() => setQualityKey(q.key)} className={cn("pill", qualityKey === q.key && "on")}>{q.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="field-label mb-1.5 block">Options</label>
        <div className="flex flex-wrap gap-3">
          {availableToggles.logo && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold">
              <input type="checkbox" checked={toggles.includeLogo} onChange={() => onTogglesChange({ ...toggles, includeLogo: !toggles.includeLogo })} /> Logo
            </label>
          )}
          {availableToggles.watermark && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold">
              <input type="checkbox" checked={toggles.includeWatermark} onChange={() => onTogglesChange({ ...toggles, includeWatermark: !toggles.includeWatermark })} /> Watermark
            </label>
          )}
          {availableToggles.contact && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold">
              <input type="checkbox" checked={toggles.includeContact} onChange={() => onTogglesChange({ ...toggles, includeContact: !toggles.includeContact })} /> Contact details
            </label>
          )}
          {availableToggles.qr && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold">
              <input type="checkbox" checked={toggles.includeQr} onChange={() => onTogglesChange({ ...toggles, includeQr: !toggles.includeQr })} /> QR code
            </label>
          )}
        </div>
      </div>

      <button onClick={doExport} disabled={exporting} className="btn-primary w-full justify-center disabled:opacity-60">
        <DownloadIcon className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Image"}
      </button>
    </div>
  );
}
