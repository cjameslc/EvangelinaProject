"use client";

import { useMemo, useState } from "react";
import { PlaceInsightRow, type PlaceInsightData } from "@/components/guest/PlaceInsightRow";
import { NearbyMap, type MapPlace } from "@/components/guest/NearbyMap";
import { useAllFavorites, favoriteKey } from "@/lib/places/favorites";
import type { GuidebookCategory } from "@/lib/guidebookContent";

type QuickFilter = "open" | "rated" | "walking" | "favorites";
const QUICK_FILTERS: { key: QuickFilter; icon: string; label: string }[] = [
  { key: "open", icon: "🟢", label: "Open Now" },
  { key: "rated", icon: "🏆", label: "Highest Rated" },
  { key: "walking", icon: "🚶", label: "Walking Distance" },
  { key: "favorites", icon: "❤️", label: "Favorites" },
];

/** The filterable place list for a single Nearby category page (Food,
 * Coffee, Grocery, Transportation) — same quick-filter chips as the
 * all-categories NearbyPlacesSection, scoped to just this page's
 * category/categories, plus a real interactive map synced to the same
 * selection as the cards below it. */
export function NearbyCategoryList({
  categories, insights, origin,
}: {
  categories: GuidebookCategory[];
  insights: Record<string, PlaceInsightData>;
  origin?: { lat: number; lng: number } | null;
}) {
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const favoriteIds = useAllFavorites();

  function toggleQuickFilter(f: QuickFilter) {
    setQuickFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  const filtered = useMemo(() => {
    if (quickFilters.length === 0) return categories;
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          const insight = insights[i];
          if (quickFilters.includes("open") && insight?.openNow !== true) return false;
          if (quickFilters.includes("rated") && !(insight?.rating != null && insight.rating >= 4.5)) return false;
          if (quickFilters.includes("walking") && !(insight?.distanceMeters != null && insight.distanceMeters <= 1000)) return false;
          if (quickFilters.includes("favorites") && !favoriteIds.includes(favoriteKey(c.key, i))) return false;
          return true;
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, quickFilters, insights, favoriteIds]);

  const mapPlaces: MapPlace[] = useMemo(
    () =>
      filtered.flatMap((c) =>
        c.items
          .map((item) => {
            const insight = insights[item];
            if (insight?.lat == null || insight?.lng == null) return null;
            return { key: favoriteKey(c.key, item), name: item, category: c.key, icon: c.icon, lat: insight.lat, lng: insight.lng } satisfies MapPlace;
          })
          .filter((p): p is MapPlace => p !== null)
      ),
    [filtered, insights]
  );

  return (
    <div>
      {mapPlaces.length > 0 && (
        <div className="mb-4">
          <NearbyMap origin={origin ?? null} places={mapPlaces} selected={selected} onSelect={setSelected} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => toggleQuickFilter(f.key)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition ${quickFilters.includes(f.key) ? "border-rausch bg-rausch/10 text-rausch" : "border-[var(--line)] text-[var(--gray)] hover:bg-[var(--bg-2)]"}`}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {filtered.length === 0 ? (
          <div className="card p-6 text-center text-[13.5px] text-[var(--gray)]">
            {quickFilters.length > 0 ? "No places match these filters right now." : "No places listed in this category yet."}
          </div>
        ) : (
          filtered.map((c) => (
            <div key={c.key}>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{c.icon} {c.label}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {c.items.map((item) => {
                  const itemKey = favoriteKey(c.key, item);
                  return (
                    <PlaceInsightRow
                      key={item}
                      name={item}
                      category={c.key}
                      categoryIcon={c.icon}
                      insight={insights[item]}
                      origin={origin}
                      selected={selected === itemKey}
                      onSelect={() => setSelected((s) => (s === itemKey ? null : itemKey))}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
