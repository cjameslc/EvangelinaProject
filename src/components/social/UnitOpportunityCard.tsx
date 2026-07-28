"use client";

import { useRef, useState } from "react";
import { formatUnitDisplay, peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STAY_TYPES } from "@/lib/constants";
import { groupOpenDatesByStayType, type UnitOpportunity } from "@/lib/socialOpportunity";
import { drawUnitGraphic, downloadCanvas, loadImage } from "@/lib/socialGraphic";
import { DownloadIcon, SparkleIcon } from "@/components/ui/Icons";

export type ViewMode = "grid" | "tile" | "story" | "carousel";

const MODE_ASPECT: Record<ViewMode, string> = {
  grid: "aspect-[4/5]", // ~1080x1350
  tile: "aspect-square",
  story: "aspect-[9/16]",
  carousel: "aspect-[4/5]",
};

export function UnitOpportunityCard({
  unit, opportunity, todayIso, mode, onOpenGenerator,
}: {
  unit: { id: string; unitNumber: string; shortName: string; photoUrl: string | null };
  opportunity: UnitOpportunity;
  todayIso: string;
  mode: ViewMode;
  onOpenGenerator: () => void;
}) {
  const byStayType = groupOpenDatesByStayType(opportunity.days);
  const totalOpenDays = opportunity.days.filter((d) => d.openStayTypes.length > 0).length;
  const openToday = opportunity.days.find((d) => d.iso === todayIso)?.openStayTypes.length ?? 0;

  const scarcity =
    totalOpenDays === 0 ? null :
    openToday > 0 ? "Available Today" :
    totalOpenDays <= 2 ? `Only ${totalOpenDays} Date${totalOpenDays === 1 ? "" : "s"} Left` :
    null;

  const cheapestPrice = Object.values(opportunity.days.flatMap((d) => Object.values(d.price))).length
    ? Math.min(...opportunity.days.flatMap((d) => Object.values(d.price)).filter((p): p is number => typeof p === "number"))
    : null;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function downloadImage() {
    setDownloading(true);
    const canvas = canvasRef.current ?? document.createElement("canvas");
    const [w, h] = mode === "story" ? [1080, 1920] : mode === "tile" ? [1080, 1080] : [1080, 1350];
    canvas.width = w; canvas.height = h;
    const photo = unit.photoUrl ? await loadImage(unit.photoUrl) : null;
    const dateLines = Object.entries(byStayType).filter(([, v]) => v.length).map(([k, v]) => `${STAY_TYPES[k as keyof typeof STAY_TYPES]?.label ?? k}: ${v.join(", ")}`);
    drawUnitGraphic(canvas, {
      unitName: formatUnitDisplay(unit.unitNumber, unit.shortName),
      badge: scarcity ?? "AVAILABLE",
      dateLines,
      price: cheapestPrice ? `From ${peso(cheapestPrice)}` : null,
      ctaLine: "Book Now — message us",
      unitPhoto: photo,
    });
    downloadCanvas(canvas, `${unit.shortName.replace(/\s/g, "-").toLowerCase()}-${mode}.png`);
    setDownloading(false);
  }

  if (totalOpenDays === 0) {
    return (
      <div className={cn("relative flex flex-none flex-col justify-end overflow-hidden rounded-2xl bg-[var(--bg-2)] p-4", MODE_ASPECT[mode], mode === "carousel" ? "w-[280px]" : "")}>
        <p className="text-[13px] font-bold text-[var(--gray)]">{formatUnitDisplay(unit.unitNumber, unit.shortName)}</p>
        <p className="mt-1 text-[15px] font-extrabold">Fully booked this window</p>
      </div>
    );
  }

  return (
    <div className={cn("group relative flex-none overflow-hidden rounded-2xl shadow-s", MODE_ASPECT[mode], mode === "carousel" ? "w-[280px]" : "")}>
      {unit.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={unit.photoUrl} alt={unit.shortName} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-rausch to-[#B0203A]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

      {scarcity && (
        <span className="absolute left-3 top-3 rounded-full bg-rausch px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-white">
          {scarcity}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <p className="text-[20px] font-black leading-none tracking-tight">{formatUnitDisplay(unit.unitNumber, unit.shortName)}</p>
        <div className="mt-2 space-y-0.5">
          {Object.entries(byStayType).filter(([, v]) => v.length).map(([stayType, dates]) => (
            <p key={stayType} className="text-[12px] font-semibold">
              <span className="opacity-80">{STAY_TYPES[stayType as keyof typeof STAY_TYPES]?.label ?? stayType}:</span> {dates.join(", ")}
            </p>
          ))}
        </div>
        {cheapestPrice && <p className="mt-1.5 text-[13px] font-extrabold">From {peso(cheapestPrice)}</p>}
        <div className="mt-3 flex gap-2">
          <button onClick={onOpenGenerator} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-extrabold text-[var(--ink)] transition hover:bg-white/90">
            <SparkleIcon className="h-3.5 w-3.5" /> Create post
          </button>
          <button onClick={downloadImage} disabled={downloading} title="Download image" className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-white/20 text-white backdrop-blur transition hover:bg-white/30 disabled:opacity-60">
            <DownloadIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
