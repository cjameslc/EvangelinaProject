import { getForecastAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { ForecastSectionClient } from "@/components/analytics/sections/ForecastSectionClient";

// Analytics is gated to OWNER_ADMIN/CO_OWNER only (canSeeAnalytics) — same
// admin-only reasoning RevenueGoalsSection.tsx documents, which is why
// nothing here needs the MoneyDisplay masking wire-type from the
// gamification work (that exists for non-admin viewers; none reach this page).
export async function ForecastSection({ user, filters }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters }) {
  const data = await getForecastAnalytics(user, filters);
  return <ForecastSectionClient data={data} />;
}
