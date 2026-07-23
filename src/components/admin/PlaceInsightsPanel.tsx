"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { fmtDate } from "@/lib/format";
import type { GuidebookCategory } from "@/lib/guidebookContent";

type Summary = { category: string; count: number; lastFetchedAt: string | null };

/** Guest Experience "Nearby" pages — triggers a real, billed Google Places
 * API refresh per category (never automatic/scheduled, see /api/places/
 * refresh). One button per category so a refresh always stays small and
 * fast rather than one long request across every named place at once. */
export function PlaceInsightsPanel({ categories, initialSummary }: { categories: GuidebookCategory[]; initialSummary: Summary[] }) {
  const toast = useToast();
  const [summaryByCategory, setSummaryByCategory] = useState(new Map(initialSummary.map((s) => [s.category, s])));
  const [refreshing, setRefreshing] = useState<string | null>(null);

  async function refresh(category: string) {
    if (refreshing) return;
    setRefreshing(category);
    try {
      const res = await fetch("/api/places/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast(j.error ?? "Couldn't refresh this category", true); return; }
      const failed = j.results.filter((r: { ok: boolean }) => !r.ok).length;
      setSummaryByCategory((prev) => new Map(prev).set(category, { category, count: j.results.length, lastFetchedAt: new Date().toISOString() }));
      toast(failed > 0 ? `Refreshed — ${failed} of ${j.results.length} places couldn't be matched` : `Refreshed ${j.results.length} places ✓`, failed > 0);
    } catch {
      toast("Couldn't refresh this category", true);
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div>
      <p className="mb-3 text-[13px] text-[var(--gray)]">
        Pulls real distance, opening hours, and rating for each place below from Google Places. Each refresh is a real API call — do it per category, not on a schedule, and only for categories guests actually see (set your property&rsquo;s coordinates above first, or distance won&rsquo;t be available).
      </p>
      <div className="card divide-y divide-[var(--line)] overflow-hidden">
        {categories.map((c) => {
          const summary = summaryByCategory.get(c.key);
          const isRefreshing = refreshing === c.key;
          return (
            <div key={c.key} className="flex items-center gap-3 p-3.5">
              <span className="text-[18px]">{c.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold">{c.label}</div>
                <div className="text-[11.5px] text-[var(--gray)]">
                  {c.items.length} place{c.items.length !== 1 ? "s" : ""}
                  {summary?.lastFetchedAt ? ` · last refreshed ${fmtDate(summary.lastFetchedAt, { month: "short", day: "numeric", year: "numeric" })}` : " · never refreshed"}
                </div>
              </div>
              <button onClick={() => refresh(c.key)} disabled={!!refreshing || c.items.length === 0} className="btn-sm btn flex-none">
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
