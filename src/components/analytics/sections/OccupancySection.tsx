import { getOccupancyAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { OccupancySectionClient } from "@/components/analytics/sections/OccupancySectionClient";

export async function OccupancySection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const data = await getOccupancyAnalytics(user, filters);
  return <OccupancySectionClient data={data} />;
}
