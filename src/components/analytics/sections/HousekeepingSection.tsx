import { StatCard } from "@/components/ui/StatCard";
import { getHousekeepingAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";

export async function HousekeepingSection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const hk = await getHousekeepingAnalytics(user, filters);
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="mb-3 text-[14px] font-extrabold">Housekeeping</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Completed Tasks" value={hk.completed} />
          <StatCard label="Pending Tasks" value={hk.pending} warn={hk.pending > 0} tone="caution" />
          <StatCard label="Avg Cleaning Time" value={hk.avgDurationMinutes > 0 ? `${hk.avgDurationMinutes}m` : "—"} />
          <StatCard label="Rooms Ready" value={hk.roomsReady} sub="as of now" info="Current room-readiness snapshot — not scoped to the selected period." />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Cleaner performance</h3>
          {hk.cleanerPerformance.length === 0 ? (
            <p className="text-[13px] text-[var(--gray)]">No completed cleanings in this period.</p>
          ) : (
            <div className="space-y-1.5">
              {hk.cleanerPerformance.map((row) => (
                <div key={row.employeeId} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold">{row.name}</span>
                  <span>{row.completedCount} cleaning{row.completedCount === 1 ? "" : "s"} · avg {row.avgDurationMinutes}m</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Delayed cleanings <span className="font-semibold text-[var(--gray)]">(90+ min, right now)</span></h3>
          {hk.delayed.length === 0 ? (
            <p className="text-[13px] text-[var(--gray)]">None — every in-progress clean is within the usual window.</p>
          ) : (
            <div className="space-y-1.5">
              {hk.delayed.map((d) => (
                <div key={d.unitId} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-amber">{d.unitId}</span>
                  <span>{d.minutesElapsed}m elapsed</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
