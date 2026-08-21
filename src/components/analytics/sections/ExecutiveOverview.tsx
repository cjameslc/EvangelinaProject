import { getProfitabilityAnalytics, getForecastAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { ExecutiveOverviewClient } from "@/components/analytics/sections/ExecutiveOverviewClient";

// The redesigned "understand your business in 30 seconds" experience —
// pure presentation over data this session already built (profitability.ts
// + forecastEngine.ts, both already computing every real number this view
// needs: verdict, waterfall, break-even, unit economics, booker/source
// profitability, red flags, brutal truths, top actions, weekday demand,
// month-end scenarios, target probability). No new query logic — this
// component's whole job is re-presenting that existing data with an Apple/
// Emil-grade information hierarchy instead of a long report.
export async function ExecutiveOverview({ user, filters, firstName }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters; firstName: string }) {
  const [profitability, forecast] = await Promise.all([
    getProfitabilityAnalytics(user, filters),
    getForecastAnalytics(user, filters),
  ]);
  return <ExecutiveOverviewClient profitability={profitability} forecast={forecast} firstName={firstName} />;
}
