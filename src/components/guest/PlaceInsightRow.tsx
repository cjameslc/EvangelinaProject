import { mapsSearchUrl, wazeUrl } from "@/lib/guideUtils";
import { formatDistance, todaysHoursLine } from "@/lib/places/placeInsightFormat";
import { fmtDate } from "@/lib/format";

export type PlaceInsightData = {
  distanceMeters: number | null;
  rating: number | null;
  ratingCount: number | null;
  openingHours: string[] | null;
  openNow: boolean | null;
  summary: string | null;
  businessStatus: string | null;
  lastFetchedAt: string;
} | undefined;

/** One nearby place — name + real Google-sourced distance/hours/rating
 * when available (see PlaceInsight/placeInsightService.ts), Maps/Waze
 * buttons always. A place that's never been refreshed by Admin just shows
 * its name and the two directions buttons, same as before this feature
 * existed — never a guessed distance or invented hours. */
export function PlaceInsightRow({ name, insight }: { name: string; insight: PlaceInsightData }) {
  const closed = insight?.businessStatus === "CLOSED_PERMANENTLY";
  const todayHours = todaysHoursLine(insight?.openingHours ?? null);

  return (
    <div className="rounded-xl border border-[var(--line)] px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[13.5px] font-semibold ${closed ? "text-[var(--gray)] line-through" : ""}`}>{name}</span>
        <div className="flex flex-none gap-1.5">
          <a href={mapsSearchUrl(name)} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🗺️</a>
          <a href={wazeUrl(name)} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🚗</a>
        </div>
      </div>

      {insight && !closed && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--gray)]">
          {insight.distanceMeters != null && (
            <span className="font-bold text-rausch">{formatDistance(insight.distanceMeters)}</span>
          )}
          {insight.openNow != null && (
            <span className={insight.openNow ? "font-semibold text-green" : "font-semibold text-rausch"}>
              {insight.openNow ? "Open now" : "Closed now"}
            </span>
          )}
          {insight.rating != null && (
            <span>★ {insight.rating.toFixed(1)}{insight.ratingCount != null && ` (${insight.ratingCount})`}</span>
          )}
          {todayHours && <span>· {todayHours}</span>}
        </div>
      )}

      {insight?.summary && !closed && <p className="mt-1 text-[11.5px] italic leading-snug text-[var(--gray)]">{insight.summary}</p>}

      {closed && <p className="mt-1 text-[11px] font-semibold text-rausch">Google lists this as permanently closed.</p>}

      {insight && (
        <p className="mt-1 text-[10px] text-[var(--gray)] opacity-70">
          via Google · as of {fmtDate(insight.lastFetchedAt, { month: "short", day: "numeric" })}
        </p>
      )}
    </div>
  );
}
