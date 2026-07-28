"use client";

import { useState } from "react";
import { mapsSearchUrl, wazeUrl, directionsUrl, GRAB_URL } from "@/lib/guideUtils";
import { formatDistance, todaysHoursLine, placePhotoUrl } from "@/lib/places/placeInsightFormat";
import { getFunFact, getHostRecommends, computeSmartHighlights } from "@/lib/places/placeEditorial";
import { useFavorite, favoriteKey } from "@/lib/places/favorites";
import { fmtDate } from "@/lib/format";

export type PlaceInsightData = {
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  walkMinutes: number | null;
  driveMinutes: number | null;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null;
  phoneNumber: string | null;
  website: string | null;
  photoReference: string | null;
  openingHours: string[] | null;
  openNow: boolean | null;
  summary: string | null;
  hostOverview: string | null;
  businessStatus: string | null;
  lastFetchedAt: string;
} | undefined;

const PRICE_LABEL = ["Free", "Budget", "Moderate", "Expensive", "Very expensive"];

/** One nearby place, presented as a proper card (real Google photo when
 * available, badges for distance/hours/rating, editorial flavor, quick
 * actions) — collapsed to a compact summary by default so a long category
 * list doesn't turn into a wall of text; "Details" expands the rest. A
 * place that's never been refreshed by Admin just shows its name, a
 * generic icon tile, and the directions buttons — never a guessed
 * distance, invented hours, or a stock photo standing in for a real one. */
export function PlaceInsightRow({
  name, category, categoryIcon, insight, origin, selected, onSelect,
}: {
  name: string;
  category: string;
  categoryIcon?: string;
  insight: PlaceInsightData;
  origin?: { lat: number; lng: number } | null;
  /** Optional — lets a parent (e.g. NearbyMap) know this card is the
   * currently-highlighted one, and be told when it's picked. */
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const key = favoriteKey(category, name);
  const [isFavorite, toggleFavorite] = useFavorite(key);

  const closed = insight?.businessStatus === "CLOSED_PERMANENTLY";
  const todayHours = todaysHoursLine(insight?.openingHours ?? null);
  const funFact = getFunFact(category, name);
  const hostRecommends = getHostRecommends(category);
  const highlights = computeSmartHighlights(insight);
  const hasDestination = insight?.lat != null && insight?.lng != null;
  const destination = hasDestination ? { lat: insight!.lat!, lng: insight!.lng! } : name;
  const photoUrl = placePhotoUrl(insight?.photoReference, 500);

  async function shareLocation() {
    const url = mapsSearchUrl(name);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: name, text: `${name} — near Evangelina's Staycation`, url });
        return;
      } catch {
        // User cancelled the share sheet, or it threw — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard unavailable either — the Maps button still works.
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-[var(--card)] shadow-s transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,0,0,.14)] ${selected ? "border-rausch ring-2 ring-rausch/30" : "border-[var(--line)]"}`}
    >
      {/* Featured photo — real Google photo, or a soft gradient icon tile when none exists. */}
      <button onClick={onSelect} className="group relative block aspect-[16/9] w-full overflow-hidden bg-[var(--bg-2)]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-navy/90 to-navy text-3xl opacity-80">
            {categoryIcon ?? "📍"}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <span className={`truncate text-[14.5px] font-extrabold text-white drop-shadow ${closed ? "line-through opacity-70" : ""}`}>{name}</span>
          {/* Fixed dark text below, not text-[var(--ink)] — this pill is
              always a light background overlaid on a photo, regardless of
              the page's own light/dark theme; --ink flips to near-white in
              dark mode, which made this unreadable (white text on a white
              pill). */}
          {insight?.rating != null && (
            <span className="flex-none rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-[#1a1a1a] shadow">★ {insight.rating.toFixed(1)}</span>
          )}
        </div>
      </button>

      <div className="p-3.5">
        {/* Badges — always visible when present, the "richer without clutter" summary */}
        {insight && !closed && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--gray)]">
            {insight.distanceMeters != null && <span className="font-bold text-rausch">{formatDistance(insight.distanceMeters)}</span>}
            {insight.walkMinutes != null && <span>🚶 {insight.walkMinutes} min</span>}
            {insight.driveMinutes != null && <span>🚗 {insight.driveMinutes} min</span>}
            {insight.openNow != null && (
              <span className={insight.openNow ? "font-semibold text-green" : "font-semibold text-rausch"}>{insight.openNow ? "Open now" : "Closed now"}</span>
            )}
            {insight.ratingCount != null && <span>({insight.ratingCount} reviews)</span>}
            {todayHours && <span>· {todayHours}</span>}
          </div>
        )}

        {highlights.length > 0 && !closed && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {highlights.map((h) => (
              <span key={h.label} className="rounded-full bg-gradient-to-r from-rausch/15 to-gold/15 px-2 py-0.5 text-[10.5px] font-bold text-rausch">{h.icon} {h.label}</span>
            ))}
          </div>
        )}

        {closed && <p className="mt-1 text-[11px] font-semibold text-rausch">Google lists this as permanently closed.</p>}

        {/* Always-visible quick actions */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <a href={mapsSearchUrl(name)} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🗺️ Maps</a>
          <a href={directionsUrl(destination, origin, "walking")} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🧭 Directions</a>
          <a href={GRAB_URL} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🚕 Grab</a>
          <button onClick={toggleFavorite} aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"} className="btn-sm btn">
            {isFavorite ? "❤️ Saved" : "🤍 Save"}
          </button>
          <button onClick={() => setExpanded((e) => !e)} className="btn-sm btn ml-auto">
            {expanded ? "Less ▴" : "Details ▾"}
          </button>
        </div>

        {/* Expanded details */}
        {expanded && !closed && (
          <div className="mt-3 space-y-2.5 border-t border-[var(--line)] pt-3">
            {insight?.hostOverview && <p className="text-[12.5px] leading-relaxed">{insight.hostOverview}</p>}
            {funFact && <p className="text-[12px] text-[var(--gray)]">{funFact}</p>}

            {hostRecommends.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hostRecommends.map((r) => (
                  <span key={r.label} className="rounded-full border border-[var(--line)] px-2 py-1 text-[11px] font-bold">{r.icon} {r.label}</span>
                ))}
              </div>
            )}

            {insight?.priceLevel != null && (
              <div className="text-[11.5px] text-[var(--gray)]">💰 {PRICE_LABEL[insight.priceLevel] ?? "—"}</div>
            )}

            {insight?.openingHours && insight.openingHours.length > 0 && (
              <details className="text-[11.5px] text-[var(--gray)]">
                <summary className="cursor-pointer font-bold text-[var(--ink)]">Full weekly hours</summary>
                <ul className="mt-1 space-y-0.5">
                  {insight.openingHours.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </details>
            )}

            {(insight?.phoneNumber || insight?.website) && (
              <div className="flex flex-wrap gap-2">
                {insight.phoneNumber && <a href={`tel:${insight.phoneNumber.replace(/[^\d+]/g, "")}`} className="btn-sm btn">📞 {insight.phoneNumber}</a>}
                {insight.website && <a href={insight.website} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🌐 Website</a>}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <a href={wazeUrl(name)} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🚗 Waze</a>
              <button onClick={shareLocation} className="btn-sm btn">📤 Share</button>
            </div>

            {insight && (
              <p className="text-[10px] text-[var(--gray)] opacity-70">via Google · as of {fmtDate(insight.lastFetchedAt, { month: "short", day: "numeric" })}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
