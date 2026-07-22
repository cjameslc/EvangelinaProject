"use client";

import dynamic from "next/dynamic";
import { StatCard } from "@/components/ui/StatCard";
import type { OccupancyAnalytics } from "@/app/analytics/queries";

const OccupancyCalendarGrid = dynamic(() => import("@/components/analytics/charts/OccupancyCalendarGrid").then((m) => m.OccupancyCalendarGrid), { ssr: false, loading: () => <div className="h-[160px] animate-pulse rounded-xl bg-[var(--bg-2)]" /> });

export function OccupancySectionClient({ data }: { data: OccupancyAnalytics }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Occupancy" value={`${data.occupancyPct}%`} info="Occupied nights ÷ available room-nights for this period." />
        <StatCard label="Occupied Nights" value={data.occupiedNights} />
        <StatCard label="Maintenance Nights" value={data.maintenanceNights} warn={data.maintenanceNights > 0} tone="caution" />
        <StatCard label="Cleaning Nights" value={data.cleaningNights} />
        <StatCard
          label="Occupancy Forecast" value={`${data.forecastPct}%`} projected
          sub={`${data.forecastMethod} · ${data.forecastConfidence} confidence`} info="An estimate from recent months' actual occupancy, not a guarantee."
        />
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[14px] font-extrabold">Occupancy calendar</h3>
          {data.calendarTruncated && <span className="text-[11px] text-[var(--gray)]">Showing the last {data.calendarDays.length} days — pick a shorter range to see the full period.</span>}
        </div>
        {data.calendarUnits.length === 0 || data.calendarDays.length === 0 ? (
          <p className="text-[13px] text-[var(--gray)]">No units in scope for this filter.</p>
        ) : (
          <OccupancyCalendarGrid units={data.calendarUnits} days={data.calendarDays} cells={data.calendarCells} />
        )}
      </div>
    </div>
  );
}
