"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { ANALYTICS_PERIOD_PRESETS, type AnalyticsPeriodPreset } from "@/lib/analytics/period";
import { PLATFORMS, PLATFORM_LABEL, STAY_TYPES } from "@/lib/constants";

type UnitOption = { id: string; shortName: string };
type BookerOption = { id: string; name: string };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// Filters live in the URL (not local state) so a filtered view is
// bookmarkable/shareable, and the page's Server Component render, the
// auto-refresh timer, and a shared link all agree on exactly what's
// filtered. Booker/Platform/Stay Type/Status are the newer additions
// (added for Forecast & Predictive Analytics) — applied post-fetch across
// EVERY section on this page, not just Forecast, via
// applyBookingFilters() in queries.ts.
export function AnalyticsFilterBar({ units, bookers }: { units: UnitOption[]; bookers: BookerOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const preset = (searchParams.get("period") as AnalyticsPeriodPreset) || "month";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";
  const selectedUnitIds = searchParams.get("units")?.split(",").filter(Boolean) ?? [];
  const selectedBookerIds = searchParams.get("bookers")?.split(",").filter(Boolean) ?? [];
  const selectedPlatforms = searchParams.get("platforms")?.split(",").filter(Boolean) ?? [];
  const selectedStayTypes = searchParams.get("stayTypes")?.split(",").filter(Boolean) ?? [];
  const selectedStatuses = searchParams.get("statuses")?.split(",").filter(Boolean) ?? [];

  function setParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggle(paramKey: string, current: string[], value: string) {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setParam({ [paramKey]: next.length > 0 ? next.join(",") : null });
  }

  const hasExtraFilters = selectedBookerIds.length > 0 || selectedPlatforms.length > 0 || selectedStayTypes.length > 0 || selectedStatuses.length > 0;

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
            <input id="analytics-start" type="date" max={customEnd || undefined} value={customStart} onChange={(e) => setParam({ start: e.target.value })} className="field-input mt-1" />
          </div>
          <div>
            <label htmlFor="analytics-end" className="field-label">End</label>
            <input id="analytics-end" type="date" min={customStart || undefined} value={customEnd} onChange={(e) => setParam({ end: e.target.value })} className="field-input mt-1" />
          </div>
        </div>
      )}

      {units.length > 1 && (
        <FilterRow label="Units">
          {units.map((u) => (
            <Pill key={u.id} on={selectedUnitIds.includes(u.id)} onClick={() => toggle("units", selectedUnitIds, u.id)}>
              {u.shortName}
            </Pill>
          ))}
          {selectedUnitIds.length > 0 && <ClearButton onClick={() => setParam({ units: null })} />}
        </FilterRow>
      )}

      {bookers.length > 1 && (
        <FilterRow label="Booker">
          {bookers.map((b) => (
            <Pill key={b.id} on={selectedBookerIds.includes(b.id)} onClick={() => toggle("bookers", selectedBookerIds, b.id)}>
              {b.name}
            </Pill>
          ))}
          {selectedBookerIds.length > 0 && <ClearButton onClick={() => setParam({ bookers: null })} />}
        </FilterRow>
      )}

      <FilterRow label="Source">
        {PLATFORMS.map((p) => (
          <Pill key={p} on={selectedPlatforms.includes(p)} onClick={() => toggle("platforms", selectedPlatforms, p)}>
            {PLATFORM_LABEL[p] ?? p}
          </Pill>
        ))}
        {selectedPlatforms.length > 0 && <ClearButton onClick={() => setParam({ platforms: null })} />}
      </FilterRow>

      <FilterRow label="Stay Type">
        {Object.keys(STAY_TYPES).map((key) => (
          <Pill key={key} on={selectedStayTypes.includes(key)} onClick={() => toggle("stayTypes", selectedStayTypes, key)}>
            {(STAY_TYPES as Record<string, { label: string }>)[key].label}
          </Pill>
        ))}
        {selectedStayTypes.length > 0 && <ClearButton onClick={() => setParam({ stayTypes: null })} />}
      </FilterRow>

      <FilterRow label="Status">
        {STATUS_OPTIONS.map((s) => (
          <Pill key={s.value} on={selectedStatuses.includes(s.value)} onClick={() => toggle("statuses", selectedStatuses, s.value)}>
            {s.label}
          </Pill>
        ))}
        {selectedStatuses.length > 0 && <ClearButton onClick={() => setParam({ statuses: null })} />}
      </FilterRow>

      {hasExtraFilters && (
        <button
          onClick={() => setParam({ bookers: null, platforms: null, stayTypes: null, statuses: null })}
          className="text-[11.5px] font-semibold text-[var(--gray)] underline"
        >
          Clear all extra filters
        </button>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</span>
      {children}
    </div>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-[11.5px] font-semibold text-[var(--gray)] underline">
      Clear
    </button>
  );
}
