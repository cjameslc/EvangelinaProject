"use client";

import { cn } from "@/lib/utils";
import { STAY_TYPES } from "@/lib/constants";
import { formatUnitDisplay, peso } from "@/lib/format";
import { groupOpenDatesByStayType, pricesByStayType, type UnitOpportunity } from "@/lib/socialOpportunity";
import { SparkleIcon } from "@/components/ui/Icons";

export type ViewMode = "grid" | "tile" | "story" | "carousel";

const MODE_ASPECT: Record<ViewMode, string> = {
  grid: "aspect-[4/5]", // ~1080x1350
  tile: "aspect-square",
  story: "aspect-[9/16]",
  carousel: "aspect-[4/5]",
};

export function scarcityFor(opportunity: UnitOpportunity, todayIso: string) {
  const totalOpenDays = opportunity.days.filter((d) => d.openStayTypes.length > 0).length;
  const openToday = opportunity.days.find((d) => d.iso === todayIso)?.openStayTypes.length ?? 0;
  return totalOpenDays === 0 ? null :
    openToday > 0 ? "Available Today" :
    totalOpenDays <= 2 ? `Only ${totalOpenDays} Date${totalOpenDays === 1 ? "" : "s"} Left` :
    null;
}

/**
 * One "Daycation from ₱1,499" line per open stay type — never a single
 * blended cheapest-across-everything number, since that could silently
 * surface a weekday-night-promo-discounted Night price under a generic
 * "From" label with no indication it doesn't apply to Daycation/Full too
 * (a real, confirmed source of confusion — quotePrice already computes
 * each stay type's real rate correctly, this just stops mixing them).
 */
export function priceLinesFor(opportunity: UnitOpportunity): string[] {
  const byType = pricesByStayType(opportunity.days);
  return Object.entries(byType)
    .filter((entry): entry is [keyof typeof STAY_TYPES, number] => entry[1] !== undefined)
    .map(([stayType, price]) => `${STAY_TYPES[stayType]?.label ?? stayType} from ${peso(price)}`);
}

/**
 * The real photo + gradient overlay + badge + text-stack visual — this IS
 * a legitimate live preview of what downloadUnitGraphic() will produce
 * (same real data), so it's shared between the small per-unit rail tile
 * (UnitOpportunityCard below) and the large Content Studio workspace
 * preview (ContentStudioWorkspace) instead of being duplicated.
 */
export function UnitGraphicPreview({
  unit, opportunity, todayIso, aspectClassName, scale = "normal", primaryColor, secondaryColor,
}: {
  unit: { unitNumber: string; shortName: string; photoUrl: string | null };
  opportunity: UnitOpportunity;
  todayIso: string;
  aspectClassName: string;
  scale?: "normal" | "large";
  /** Brand Kit colors — when unset, keeps the original rausch Tailwind
   * classes rather than switching every card to an inline style. */
  primaryColor?: string | null;
  secondaryColor?: string | null;
}) {
  const byStayType = groupOpenDatesByStayType(opportunity.days);
  const totalOpenDays = opportunity.days.filter((d) => d.openStayTypes.length > 0).length;
  const scarcity = scarcityFor(opportunity, todayIso);
  const priceLines = priceLinesFor(opportunity);
  const hasCustomColors = !!(primaryColor || secondaryColor);

  if (totalOpenDays === 0) {
    return (
      <div className={cn("relative flex flex-col justify-end overflow-hidden rounded-2xl bg-[var(--bg-2)] p-4", aspectClassName)}>
        <p className="text-[13px] font-bold text-[var(--gray)]">{formatUnitDisplay(unit.unitNumber, unit.shortName)}</p>
        <p className="mt-1 text-[15px] font-extrabold">Fully booked this window</p>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl shadow-s", aspectClassName)}>
      {unit.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={unit.photoUrl} alt={unit.shortName} className="absolute inset-0 h-full w-full object-cover" />
      ) : hasCustomColors ? (
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom right, ${primaryColor || "#FF385C"}, ${secondaryColor || "#B0203A"})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-rausch to-[#B0203A]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

      {scarcity && (
        <span
          className={cn("absolute left-3 top-3 rounded-full font-extrabold uppercase tracking-wide text-white", !hasCustomColors && "bg-rausch", scale === "large" ? "px-3.5 py-1.5 text-[13px]" : "px-2.5 py-1 text-[10.5px]")}
          style={hasCustomColors ? { backgroundColor: primaryColor || "#FF385C" } : undefined}
        >
          {scarcity}
        </span>
      )}

      <div className={cn("absolute inset-x-0 bottom-0 text-white", scale === "large" ? "p-7" : "p-4")}>
        <p className={cn("font-black leading-none tracking-tight", scale === "large" ? "text-[32px]" : "text-[20px]")}>{formatUnitDisplay(unit.unitNumber, unit.shortName)}</p>
        <div className={cn("space-y-0.5", scale === "large" ? "mt-3" : "mt-2")}>
          {Object.entries(byStayType).filter(([, v]) => v.length).map(([stayType, dates]) => (
            <p key={stayType} className={scale === "large" ? "text-[15px] font-semibold" : "text-[12px] font-semibold"}>
              <span className="opacity-80">{STAY_TYPES[stayType as keyof typeof STAY_TYPES]?.label ?? stayType}:</span> {dates.join(", ")}
            </p>
          ))}
        </div>
        {priceLines.length > 0 && (
          <div className={cn("space-y-0.5", scale === "large" ? "mt-2.5" : "mt-1.5")}>
            {priceLines.map((line) => (
              <p key={line} className={cn("font-extrabold", scale === "large" ? "text-[16px]" : "text-[12.5px]")}>{line}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function UnitOpportunityCard({
  unit, opportunity, todayIso, mode, selected, onSelect, primaryColor, secondaryColor,
}: {
  unit: { id: string; unitNumber: string; shortName: string; photoUrl: string | null };
  opportunity: UnitOpportunity;
  todayIso: string;
  mode: ViewMode;
  selected?: boolean;
  onSelect: () => void;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}) {
  const totalOpenDays = opportunity.days.filter((d) => d.openStayTypes.length > 0).length;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative flex-none text-left transition",
        mode === "carousel" ? "w-[220px]" : "w-full",
        selected && "ring-4 ring-rausch/40 rounded-2xl"
      )}
    >
      <UnitGraphicPreview unit={unit} opportunity={opportunity} todayIso={todayIso} aspectClassName={MODE_ASPECT[mode]} primaryColor={primaryColor} secondaryColor={secondaryColor} />
      {totalOpenDays > 0 && (
        <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
          <SparkleIcon className="h-4 w-4" />
        </span>
      )}
    </button>
  );
}
