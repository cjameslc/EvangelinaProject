"use client";

import { useMemo, useState } from "react";
import { STAY_TYPES } from "@/lib/constants";
import { formatUnitDisplay, peso } from "@/lib/format";
import { groupOpenDatesByStayType, type UnitOpportunity } from "@/lib/socialOpportunity";
import { drawUnitGraphic, loadImage, buildQrImage, type GraphicResult } from "@/lib/socialGraphic";
import { UnitOpportunityCard, UnitGraphicPreview, scarcityFor, cheapestPriceFor, type ViewMode } from "@/components/social/UnitOpportunityCard";
import { CaptionEditor, type GeneratorUnitContext } from "@/components/social/CaptionEditor";
import { ExportPanel, type ExportToggles } from "@/components/social/ExportPanel";
import { DesignReviewChecklist } from "@/components/social/DesignReviewChecklist";
import type { CaptionGenResult } from "@/lib/ai/captionGenerator";

type Unit = { id: string; unitNumber: string; shortName: string; photoUrl: string | null };

const DEFAULT_TOGGLES: ExportToggles = { includeLogo: true, includeWatermark: false, includeContact: true, includeQr: false };

function unitContextFor(unit: Unit, opportunity: UnitOpportunity): GeneratorUnitContext {
  const openIsos = opportunity.days.filter((d) => d.openStayTypes.length > 0).map((d) => d.iso);
  const cheapest = cheapestPriceFor(opportunity);
  return {
    unitName: formatUnitDisplay(unit.unitNumber, unit.shortName),
    price: cheapest ? `From ${peso(cheapest)}` : null,
    dateLines: openIsos.map((iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })),
    hasPhoto: !!unit.photoUrl,
  };
}

/**
 * The Content Studio's real workspace: pick a unit from the rail, see a
 * large live preview (the same real photo/overlay/badge treatment as the
 * rail tiles, just bigger), edit its caption inline, and export it through
 * one panel with format/resolution/quality/toggle options and a Design
 * Review checklist — replacing the old "grid of cards, each with its own
 * hidden-canvas download button" layout.
 */
export function ContentStudioWorkspace({
  units, opportunities, todayIso, businessName, location, contact, amenities, promoNote, bookingLink, monthText, propertyDateLines, toast,
}: {
  units: Unit[];
  opportunities: UnitOpportunity[];
  todayIso: string;
  businessName: string;
  location: string;
  contact: string;
  amenities: string[];
  promoNote: string | null;
  bookingLink: string;
  monthText: string;
  propertyDateLines: string[];
  toast: (msg: string, isError?: boolean) => void;
}) {
  const openUnits = units.map((u, i) => ({ unit: u, opportunity: opportunities[i] })).filter((x) => x.opportunity.days.some((d) => d.openStayTypes.length > 0));
  const [selectedId, setSelectedId] = useState<string | null>(openUnits[0]?.unit.id ?? units[0]?.id ?? null);
  const selected = units.find((u) => u.id === selectedId) ?? units[0];
  const selectedOpportunity = opportunities[units.findIndex((u) => u.id === selected?.id)];

  const [toggles, setToggles] = useState<ExportToggles>(DEFAULT_TOGGLES);
  const [captionResult, setCaptionResult] = useState<CaptionGenResult | null>(null);
  const [review, setReview] = useState<{ result: GraphicResult; isTall: boolean }>({ result: { hiddenDateCount: 0 }, isTall: false });

  const captionLength = useMemo(() => {
    if (!captionResult) return null;
    return `${captionResult.headline}\n\n${captionResult.caption}\n\n${captionResult.cta}`.length;
  }, [captionResult]);

  if (!selected || !selectedOpportunity) {
    return <p className="text-[13px] text-[var(--gray)]">No units to show yet.</p>;
  }

  async function renderSelectedUnit(canvas: HTMLCanvasElement, t: ExportToggles): Promise<GraphicResult> {
    const byStayType = groupOpenDatesByStayType(selectedOpportunity.days);
    const dateLines = Object.entries(byStayType).filter(([, v]) => v.length).map(([k, v]) => `${STAY_TYPES[k as keyof typeof STAY_TYPES]?.label ?? k}: ${v.join(", ")}`);
    const scarcity = scarcityFor(selectedOpportunity, todayIso);
    const cheapestPrice = cheapestPriceFor(selectedOpportunity);
    const [photo, logo, qr] = await Promise.all([
      selected.photoUrl ? loadImage(selected.photoUrl) : Promise.resolve(null),
      t.includeLogo ? loadImage("/branding/logo.jpg") : Promise.resolve(null),
      t.includeQr ? buildQrImage(bookingLink) : Promise.resolve(null),
    ]);
    return drawUnitGraphic(canvas, {
      unitName: formatUnitDisplay(selected.unitNumber, selected.shortName),
      badge: scarcity ?? "AVAILABLE",
      dateLines,
      price: cheapestPrice ? `From ${peso(cheapestPrice)}` : null,
      ctaLine: "Book Now — message us",
      unitPhoto: photo,
      logoImage: logo,
      watermarkText: t.includeWatermark ? businessName : null,
      contactLine: t.includeContact ? contact : null,
      qrImage: qr,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr_360px]">
      {/* Rail — pick a unit */}
      <div className="flex gap-3 overflow-x-auto lg:flex-col lg:overflow-visible">
        {units.map((u, i) => (
          <div key={u.id} className="w-[160px] flex-none lg:w-full">
            <UnitOpportunityCard
              unit={u}
              opportunity={opportunities[i]}
              todayIso={todayIso}
              mode="tile"
              selected={u.id === selected.id}
              onSelect={() => setSelectedId(u.id)}
            />
            <p className="mt-1.5 truncate text-center text-[11.5px] font-bold text-[var(--gray)] lg:text-left">{formatUnitDisplay(u.unitNumber, u.shortName)}</p>
          </div>
        ))}
      </div>

      {/* Center — large live preview + caption editor */}
      <div className="space-y-5">
        <UnitGraphicPreview unit={selected} opportunity={selectedOpportunity} todayIso={todayIso} aspectClassName="aspect-[4/5] max-h-[560px]" scale="large" />
        <div className="card p-5">
          <h2 className="mb-3 text-[15px] font-extrabold">Caption</h2>
          <CaptionEditor
            unitContext={unitContextFor(selected, selectedOpportunity)}
            month={monthText}
            availableDatesSummary={propertyDateLines.length ? propertyDateLines.join(", ") : "fully booked this month"}
            businessName={businessName}
            location={location}
            contact={contact}
            amenities={amenities}
            promoNote={promoNote}
            bookingLink={bookingLink}
            toast={toast}
            onResult={setCaptionResult}
          />
        </div>
      </div>

      {/* Right — export panel + design review */}
      <div className="space-y-5">
        <div className="card p-5">
          <h2 className="mb-3 text-[15px] font-extrabold">Export</h2>
          <ExportPanel
            key={selected.id}
            render={renderSelectedUnit}
            filenameBase={selected.shortName.replace(/\s/g, "-").toLowerCase()}
            availableToggles={{ logo: true, watermark: true, contact: true, qr: true }}
            toggles={toggles}
            onTogglesChange={setToggles}
            onReview={(result, dims) => setReview({ result, isTall: dims.height > dims.width * 1.3 })}
          />
        </div>
        <DesignReviewChecklist
          captionLength={captionLength}
          hiddenDateCount={review.result.hiddenDateCount}
          toggles={toggles}
          isTallFormat={review.isTall}
        />
      </div>
    </div>
  );
}
