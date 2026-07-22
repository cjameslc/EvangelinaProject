import { getExecutiveKPIs, getRevenueAnalytics, getFinancialAnalytics, getBookingAnalytics, getOccupancyAnalytics, getGuestAnalytics, getHousekeepingAnalytics, getStaffAnalytics, getUnitPerformance, type AnalyticsFilters } from "@/app/analytics/queries";
import { resolveAnalyticsPeriod } from "@/lib/analytics/period";

/**
 * One place that fetches every section's data for an export — reuses the
 * exact same query functions the on-screen sections call, so an exported
 * report can never show a different number than what's on the page for
 * the same filters.
 */
export async function assembleExportData(user: { role: string; ownedUnitIds: string[] }, filters: AnalyticsFilters) {
  const [kpis, revenue, financial, booking, occupancy, guest, housekeeping, staff, units] = await Promise.all([
    getExecutiveKPIs(user, filters),
    getRevenueAnalytics(user, filters),
    getFinancialAnalytics(user, filters),
    getBookingAnalytics(user, filters),
    getOccupancyAnalytics(user, filters),
    getGuestAnalytics(user, filters),
    getHousekeepingAnalytics(user, filters),
    getStaffAnalytics(user, filters),
    getUnitPerformance(user, filters),
  ]);
  const { current } = resolveAnalyticsPeriod(filters.preset, { start: filters.customStart ?? "", end: filters.customEnd ?? "" });
  return { periodStart: current.start, periodEnd: current.end, kpis, revenue, financial, booking, occupancy, guest, housekeeping, staff, units };
}

export type ExportData = Awaited<ReturnType<typeof assembleExportData>>;
