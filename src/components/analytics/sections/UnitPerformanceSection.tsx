import { getUnitPerformance, type AnalyticsFilters } from "@/app/analytics/queries";
import { UnitPerformanceSectionClient } from "@/components/analytics/sections/UnitPerformanceSectionClient";

export async function UnitPerformanceSection({ user, filters }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters }) {
  const data = await getUnitPerformance(user, filters);
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-[14px] font-extrabold">Unit performance</h3>
      <p className="mb-3 text-[11.5px] text-[var(--gray)]">Click a unit for its full KPI set — ADR, RevPAR, expenses, and listed rating.</p>
      <UnitPerformanceSectionClient data={data} />
    </div>
  );
}
