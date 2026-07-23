"use client";

import { useMemo, useState } from "react";
import { initials } from "@/lib/format";
import {
  SMART_RECOMMENDATIONS, CONCIERGE_SAMPLE_QUESTIONS, BUILDING_INFO,
  type GuidebookCategory, type Amenity,
} from "@/lib/guidebookContent";
import { mapsSearchUrl } from "@/lib/guideUtils";
import { OPEN_CONCIERGE_EVENT } from "@/components/guest/AIAssistantWidget";
import type { TeamMember } from "@/lib/guidebookService";

/**
 * The booking-independent Guest Experience sections — amenities, nearby
 * places, meet your host/team, house rules, the AI Concierge entry point —
 * shared between the guest booking hub's Guidebook tab (GuidebookView.tsx,
 * one specific stay/unit) and the public home page's "Explore" preview
 * (GuestHomeView.tsx, no booking, no single unit). Extracted so the two
 * never drift into two different implementations of the same content.
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

export function InsideTheBuildingSection() {
  return (
    <div className="card p-5">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🏢 Inside the building</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1.5 text-[11px] font-bold text-[var(--gray)]">Ground floor</div>
          <ul className="space-y-1 text-[12.5px]">
            {BUILDING_INFO.groundFloor.map((f) => <li key={f}>• {f}</li>)}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-bold text-[var(--gray)]">Building features</div>
          <ul className="space-y-1 text-[12.5px]">
            {BUILDING_INFO.features.map((f) => <li key={f}>• {f}</li>)}
          </ul>
        </div>
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

/** Smart-recommendation filter chips + search + the categorized nearby-places
 * list — one self-contained unit (owns its own search/filter state) so
 * either caller just drops it in with the raw category list. */
export function NearbyPlacesSection({ categories }: { categories: GuidebookCategory[] }) {
  const [search, setSearch] = useState("");
  const [recType, setRecType] = useState<string | null>(null);
  const activeRec = SMART_RECOMMENDATIONS.find((r) => r.key === recType) ?? null;

  const filteredCategories = useMemo(() => {
    let cats = categories;
    if (activeRec) cats = cats.filter((c) => activeRec.categoryKeys.includes(c.key));
    const q = search.trim().toLowerCase();
    if (!q) return cats.map((c) => ({ ...c, items: c.items }));
    return cats
      .map((c) => ({ ...c, items: c.items.filter((i) => i.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [categories, activeRec, search]);

  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Personalize your guide</div>
      <div className="flex flex-wrap gap-2">
        {SMART_RECOMMENDATIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRecType((k) => (k === r.key ? null : r.key))}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${recType === r.key ? "border-rausch bg-rausch/10 text-rausch" : "border-[var(--line)] text-[var(--gray)] hover:bg-[var(--bg-2)]"}`}
          >
            {r.icon} {r.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the guidebook (e.g. coffee, ATM, mall)"
          className="field-input"
        />
      </div>
      <div className="mt-3 space-y-3">
        {filteredCategories.map((c) => (
          <div key={c.key} className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-[13.5px] font-extrabold">
              <span className="text-[17px]">{c.icon}</span> {c.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.items.map((item) => (
                <a
                  key={item}
                  href={mapsSearchUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-[var(--bg-2)] px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-rausch/10 hover:text-rausch"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
        {filteredCategories.length === 0 && (
          <p className="py-6 text-center text-[13px] text-[var(--gray)]">No matches — try a different search.</p>
        )}
      </div>
    </div>
  );
}
