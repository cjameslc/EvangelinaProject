import { getRevenueAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { RevenueSectionClient } from "@/components/analytics/sections/RevenueSectionClient";

export async function RevenueSection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const data = await getRevenueAnalytics(user, filters);
  return <RevenueSectionClient data={data} />;
}
