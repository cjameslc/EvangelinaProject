import { getProfitabilityAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { ProfitabilitySectionClient } from "@/components/analytics/sections/ProfitabilitySectionClient";
import { BusinessHealthBanner } from "@/components/analytics/BusinessHealthBanner";

// Analytics is gated to OWNER_ADMIN/CO_OWNER only (canSeeAnalytics) — same
// admin-only reasoning every other section on this page already documents.
// Returns both the Business Health banner (rendered separately, at the
// very top of the page, above the KPI row — brief section 1) and the full
// Profitability Intelligence panel, from the SAME single fetch so the
// banner's verdict and the panel's numbers can never disagree.
export async function ProfitabilitySection({ user, filters, bannerOnly }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters; bannerOnly?: boolean }) {
  const data = await getProfitabilityAnalytics(user, filters);
  if (bannerOnly) return <BusinessHealthBanner verdict={data.healthVerdict} />;
  return <ProfitabilitySectionClient data={data} />;
}
