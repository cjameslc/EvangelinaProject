import { getStaffAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { StaffSectionClient } from "@/components/analytics/sections/StaffSectionClient";

export async function StaffSection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const data = await getStaffAnalytics(user, filters);
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-[14px] font-extrabold">Staff performance</h3>
      <p className="mb-3 text-[11.5px] text-[var(--gray)]">Click a row for their booking/cleaning history this period. Earnings figures match the same formula as Dashboard's &ldquo;Your team&rdquo; and Earnings' Owner Summary.</p>
      <StaffSectionClient data={data} />
    </div>
  );
}
