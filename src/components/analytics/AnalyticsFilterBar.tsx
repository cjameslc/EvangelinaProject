"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { ANALYTICS_PERIOD_PRESETS, type AnalyticsPeriodPreset } from "@/lib/analytics/period";

type UnitOption = { id: string; shortName: string };

// Filters live in the URL (not local state) so a filtered view is
// bookmarkable/shareable, and the page's Server Component render, the
// auto-refresh timer (added in a later phase), and a shared link all agree
// on exactly what's filtered — see the module plan's data-fetching section.
export function AnalyticsFilterBar({ units }: { units: UnitOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const preset = (searchParams.get("period") as AnalyticsPeriodPreset) || "month";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";
  const selectedUnitIds = searchParams.get("units")?.split(",").filter(Boolean) ?? [];

  function setParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleUnit(unitId: string) {
    const next = selectedUnitIds.includes(unitId)
      ? selectedUnitIds.filter((id) => id !== unitId)
      : [...selectedUnitIds, unitId];
    setParam({ units: next.length > 0 ? next.join(",") : null });
  }

  return (
    <div className="card mb-5 space-y-3 p-4">
      <div className="flex flex-wrap gap-1.5">
        {ANALYTICS_PERIOD_PRESETS.map((p) => (
          <Pill key={p.value} on={preset === p.value} onClick={() => setParam({ period: p.value === "month" ? null : p.value })}>
            {p.label}
          </Pill>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="analytics-start" className="field-label">Start</label>
            <input id="analytics-start" type="date" value={customStart} onChange={(e) => setParam({ start: e.target.value })} className="field-input mt-1" />
          </div>
          <div>
            <label htmlFor="analytics-end" className="field-label">End</label>
            <input id="analytics-end" type="date" value={customEnd} onChange={(e) => setParam({ end: e.target.value })} className="field-input mt-1" />
          </div>
        </div>
      )}

      {units.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Units</span>
          {units.map((u) => (
            <Pill key={u.id} on={selectedUnitIds.includes(u.id)} onClick={() => toggleUnit(u.id)}>
              {u.shortName}
            </Pill>
          ))}
          {selectedUnitIds.length > 0 && (
            <button onClick={() => setParam({ units: null })} className="text-[11.5px] font-semibold text-[var(--gray)] underline">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
