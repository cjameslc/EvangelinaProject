"use client";

import { useMemo, useState } from "react";
import { initials } from "@/lib/format";
import {
  SMART_RECOMMENDATIONS, CONCIERGE_SAMPLE_QUESTIONS, BUILDING_INFO, GUEST_TIPS,
  type GuidebookCategory, type Amenity,
} from "@/lib/guidebookContent";
import { OPEN_CONCIERGE_EVENT } from "@/components/guest/AIAssistantWidget";
import type { TeamMember } from "@/lib/guidebookService";
import { PlaceInsightRow, type PlaceInsightData } from "@/components/guest/PlaceInsightRow";
import { NearbyMap, type MapPlace } from "@/components/guest/NearbyMap";
import { NearbyHero } from "@/components/guest/NearbyHero";
import { useAllFavorites, favoriteKey } from "@/lib/places/favorites";

/**
 * The booking-independent Guest Experience sections — amenities, nearby
 * places, meet your host/team, house rules, the AI Concierge entry point —
 * shared between the guest booking hub's Guidebook tab (GuidebookView.tsx,
 * one specific stay/unit) and the standalone /guide/* pages (no booking, no
 * single unit — see src/app/guide/amenities, /guide/house-manual, etc.).
 * Extracted so these never drift into two different implementations of the
 * same content.
 */

export function AmenitiesSection({ amenities }: { amenities: Amenity[] }) {
  return (
    <div className="card p-5">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">✨ Amenities</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {amenities.map((a) => (
          <div key={a.label} className="flex items-start gap-2 rounded-xl bg-[var(--bg-2)] p-2.5 text-[12.5px] leading-tight">
            <span className="flex-none text-[16px]">{a.icon}</span>
            <span>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const BUILDING_ITEM_META: Record<string, { icon: string; blurb: string }> = {
  "Alphamart": { icon: "🏪", blurb: "Ground-floor convenience store" },
  "Food Court": { icon: "🍽️", blurb: "Casual meals without leaving the building" },
  "Coffee Shop": { icon: "☕", blurb: "Grab a coffee on your way out" },
  "Laundry Area": { icon: "🧺", blurb: "Self-service laundry on-site" },
  "Lobby": { icon: "🛋️", blurb: "Main entrance and waiting area" },
  "Security Office": { icon: "🛡️", blurb: "On-site security team" },
  "24/7 Security": { icon: "🔒", blurb: "Guards on duty around the clock" },
  "CCTV": { icon: "📹", blurb: "Monitored common areas" },
  "Elevators": { icon: "🛗", blurb: "Serving all residential floors" },
  "Paid Parking": { icon: "🚗", blurb: "Advance reservation required" },
  "RFID Access": { icon: "🪪", blurb: "Tap-card entry to residential floors" },
  "Reception Lobby": { icon: "🛎️", blurb: "Check in with building staff" },
};

export function InsideTheBuildingSection() {
  const allItems = [...BUILDING_INFO.groundFloor, ...BUILDING_INFO.features];
  return (
    <div className="card p-5">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🏢 Inside the building</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {allItems.map((item) => {
          const meta = BUILDING_ITEM_META[item];
          return (
            <div
              key={item}
              className="rounded-xl border border-[var(--line)] bg-gradient-to-br from-[var(--card)] to-[var(--bg-2)] p-3 transition hover:-translate-y-0.5 hover:shadow-s"
            >
              <div className="text-[18px]">{meta?.icon ?? "📍"}</div>
              <div className="mt-1 text-[12px] font-extrabold leading-tight">{item}</div>
              {meta?.blurb && <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--gray)]">{meta.blurb}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MeetYourHostSection({ hostName, hostPhotoUrl, hostBio }: { hostName: string | null; hostPhotoUrl: string | null; hostBio: string | null }) {
  if (!hostName) return null;
  return (
    <div className="card p-5">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">👋 Meet your host</div>
      <div className="flex items-center gap-3">
        {hostPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hostPhotoUrl} alt={hostName} className="h-14 w-14 flex-none rounded-full object-cover" />
        ) : (
          <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[20px]">👤</span>
        )}
        <div>
          <div className="text-[14.5px] font-extrabold">{hostName}</div>
          {hostBio && <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--gray)]">{hostBio}</p>}
        </div>
      </div>
    </div>
  );
}

export function MeetOurTeamSection({ team }: { team: TeamMember[] }) {
  if (team.length === 0) return null;
  return (
    <div className="card p-5">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🤝 Meet our team</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {team.map((m) => (
          <div key={m.id} className="flex flex-col items-center gap-1.5 text-center">
            {m.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt={m.name} className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <span
                className="grid h-14 w-14 place-items-center rounded-full text-[13px] font-bold text-white"
                style={{ background: m.avatarColor }}
              >
                {initials(m.name)}
              </span>
            )}
            <div>
              <div className="text-[12.5px] font-extrabold leading-tight">{m.name}</div>
              <div className="text-[10.5px] font-semibold text-[var(--gray)]">{m.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HouseRulesSection({ houseRules }: { houseRules: string[] }) {
  if (houseRules.length === 0) return null;
  return (
    <div className="card p-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">📋 House rules</div>
      <ul className="list-disc space-y-1 pl-5 text-[13px]">
        {houseRules.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </div>
  );
}

export function ConciergeEntrySection({ blurb }: { blurb?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event(OPEN_CONCIERGE_EVENT))}
      className="card block w-full bg-gradient-to-br from-violet/10 to-rausch/10 p-5 text-left transition hover:from-violet/15 hover:to-rausch/15"
    >
      <div className="flex items-center gap-2 text-[14px] font-extrabold">🤖 Ask the AI Concierge</div>
      <p className="mt-1 text-[12.5px] text-[var(--gray)]">{blurb ?? "It already knows your stay, the WiFi, and everything below — tap to start chatting."}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CONCIERGE_SAMPLE_QUESTIONS.slice(0, 4).map((q) => (
          <span key={q} className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold dark:bg-white/10">{q}</span>
        ))}
      </div>
    </button>
  );
}

type QuickFilter = "open" | "rated" | "walking" | "favorites";
const QUICK_FILTERS: { key: QuickFilter; icon: string; label: string }[] = [
  { key: "open", icon: "🟢", label: "Open Now" },
  { key: "rated", icon: "🏆", label: "Highest Rated" },
  { key: "walking", icon: "🚶", label: "Walking Distance" },
  { key: "favorites", icon: "❤️", label: "Favorites" },
];

/** Smart-recommendation filter chips + search + the categorized nearby-places
 * list — one self-contained unit (owns its own search/filter state) so
 * either caller just drops it in with the raw category list. */
export function NearbyPlacesSection({
  categories, insights, origin,
}: {
  categories: GuidebookCategory[];
  insights?: Record<string, PlaceInsightData>;
  origin?: { lat: number; lng: number } | null;
}) {
  const [search, setSearch] = useState("");
  const [recType, setRecType] = useState<string | null>(null);
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const favoriteIds = useAllFavorites();
  const activeRec = SMART_RECOMMENDATIONS.find((r) => r.key === recType) ?? null;

  function toggleQuickFilter(f: QuickFilter) {
    setQuickFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  const filteredCategories = useMemo(() => {
    let cats = categories;
    if (activeRec) cats = cats.filter((c) => activeRec.categoryKeys.includes(c.key));
    const q = search.trim().toLowerCase();
    if (q) {
      cats = cats
        .map((c) => ({ ...c, items: c.items.filter((i) => i.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)) }))
        .filter((c) => c.items.length > 0);
    }
    if (quickFilters.length > 0) {
      cats = cats
        .map((c) => ({
          ...c,
          items: c.items.filter((i) => {
            const insight = insights?.[i];
            if (quickFilters.includes("open") && insight?.openNow !== true) return false;
            if (quickFilters.includes("rated") && !(insight?.rating != null && insight.rating >= 4.5)) return false;
            if (quickFilters.includes("walking") && !(insight?.distanceMeters != null && insight.distanceMeters <= 1000)) return false;
            if (quickFilters.includes("favorites") && !favoriteIds.includes(favoriteKey(c.key, i))) return false;
            return true;
          }),
        }))
        .filter((c) => c.items.length > 0);
    }
    return cats;
  }, [categories, activeRec, search, quickFilters, insights, favoriteIds]);

  const totalShown = filteredCategories.reduce((n, c) => n + c.items.length, 0);

  const mapPlaces: MapPlace[] = useMemo(
    () =>
      filteredCategories.flatMap((c) =>
        c.items
          .map((item) => {
            const insight = insights?.[item];
            if (insight?.lat == null || insight?.lng == null) return null;
            return { key: favoriteKey(c.key, item), name: item, category: c.key, icon: c.icon, lat: insight.lat, lng: insight.lng } satisfies MapPlace;
          })
          .filter((p): p is MapPlace => p !== null)
      ),
    [filteredCategories, insights]
  );

  return (
    <div>
      <NearbyHero />
      <NearbySummary categories={categories} />

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Guest tips</div>
        <div className="scrollbar-none flex gap-2.5 overflow-x-auto pb-1">
          {GUEST_TIPS.map((tip) => (
            <button
              key={tip.label}
              onClick={() => { setRecType(null); setSearch(tip.searchTerm); }}
              className="flex w-[150px] flex-none flex-col gap-1 rounded-2xl border border-[var(--line)] bg-gradient-to-br from-navy/[.04] to-gold/[.08] p-3 text-left transition hover:-translate-y-0.5 hover:shadow-s"
            >
              <span className="text-[18px]">{tip.icon}</span>
              <span className="text-[12px] font-extrabold leading-tight">{tip.label}</span>
              <span className="text-[10.5px] leading-snug text-[var(--gray)]">{tip.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {mapPlaces.length > 0 && (
        <div className="mt-4">
          <NearbyMap origin={origin ?? null} places={mapPlaces} selected={selected} onSelect={setSelected} />
        </div>
      )}

      <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Personalize your guide</div>
      <div className="scrollbar-none flex gap-2.5 overflow-x-auto pb-1">
        {SMART_RECOMMENDATIONS.map((r) => {
          const on = recType === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setRecType((k) => (k === r.key ? null : r.key))}
              className={`flex flex-none flex-col items-center gap-1 rounded-2xl border px-4 py-3 text-center transition-all duration-200 ${
                on
                  ? "border-transparent bg-gradient-to-br from-rausch to-gold text-white shadow-[0_10px_24px_rgba(255,56,92,.3)]"
                  : "border-[var(--line)] bg-gradient-to-br from-[var(--card)] to-[var(--bg-2)] text-[var(--ink)] hover:-translate-y-0.5 hover:shadow-s"
              }`}
            >
              <span className="text-[19px]">{r.icon}</span>
              <span className="whitespace-nowrap text-[11px] font-bold">{r.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the guidebook (e.g. coffee, ATM, mall)"
          className="field-input"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
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

      <div className="mt-3 space-y-5">
        {filteredCategories.map((c) => (
          <div key={c.key}>
            <div className="mb-2.5 flex items-center gap-2 text-[13.5px] font-extrabold">
              <span className="text-[17px]">{c.icon}</span> {c.label}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {c.items.map((item) => {
                const itemKey = favoriteKey(c.key, item);
                return (
                  <PlaceInsightRow
                    key={item}
                    name={item}
                    category={c.key}
                    categoryIcon={c.icon}
                    insight={insights?.[item]}
                    origin={origin}
                    selected={selected === itemKey}
                    onSelect={() => setSelected((s) => (s === itemKey ? null : itemKey))}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {filteredCategories.length === 0 && (
          <p className="py-6 text-center text-[13px] text-[var(--gray)]">
            {totalShown === 0 && quickFilters.length > 0 ? "No places match these filters right now." : "No matches — try a different search."}
          </p>
        )}
      </div>
    </div>
  );
}

/** "Everything you need is just minutes away" — a quick per-category count
 * strip at the top of the Nearby list, so a guest gets the gist before
 * scrolling through every entry. Counts are just how many places Admin has
 * configured in each category — not a claim about what's actually open or
 * nearby in walking terms. */
function NearbySummary({ categories }: { categories: GuidebookCategory[] }) {
  const headline = categories.filter((c) => c.items.length > 0);
  if (headline.length === 0) return null;
  return (
    <div className="card p-4">
      <div className="text-[13.5px] font-extrabold">Everything you need is just minutes away</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {headline.map((c) => (
          <div key={c.key} className="flex items-center gap-1.5 text-[12px] text-[var(--gray)]">
            <span>{c.icon}</span>
            <span className="truncate">{c.label} <span className="font-bold text-[var(--ink)]">({c.items.length})</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
