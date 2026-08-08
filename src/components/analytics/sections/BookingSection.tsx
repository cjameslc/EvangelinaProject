import { getBookingAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { BookingSectionClient } from "@/components/analytics/sections/BookingSectionClient";

export async function BookingSection({ user, filters }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters }) {
  const data = await getBookingAnalytics(user, filters);
  return <BookingSectionClient data={data} />;
}
