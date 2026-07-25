import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/lib/session";
import { canSeeAnalytics } from "@/lib/rbac";
import { rateLimit } from "@/lib/rateLimit";
import {
  getExecutiveKPIs, getRevenueAnalytics, getFinancialAnalytics, getBookingAnalytics,
  getOccupancyAnalytics, getGuestAnalytics, getHousekeepingAnalytics, getStaffAnalytics, getUnitPerformance,
  type AnalyticsFilters,
} from "@/app/analytics/queries";
import { generateExecutiveInsight, generateRevenueInsight, generateOperationsInsight, type AnalyticsInsightResult } from "@/lib/ai/analyticsInsight";

type Section = "executive" | "revenue" | "operations";

// Cached per exact data snapshot (unstable_cache incorporates the function's
// arguments into its cache key), same pattern as the Dashboard's AI insight
// — repeated requests with unchanged underlying numbers never re-hit
// Gemini; a real change in the data naturally busts the cache. A full hour
// (longer than Dashboard's 10min) because this API key's free-tier quota is
// a genuinely small 20 requests/day, shared with the guest AI Concierge —
// see AIInsightsPanel's comment for why these are also click-to-generate,
// not auto-fetched.
const getCachedExecutive = unstable_cache(
  (data: unknown, role: string, ownedUnitIds: string[]) => generateExecutiveInsight(data, role, ownedUnitIds),
  ["analytics-insight-executive"],
  { revalidate: 3600 }
);
const getCachedRevenue = unstable_cache(
  (data: unknown, role: string, ownedUnitIds: string[]) => generateRevenueInsight(data, role, ownedUnitIds),
  ["analytics-insight-revenue"],
  { revalidate: 3600 }
);
const getCachedOperations = unstable_cache(
  (data: unknown, role: string, ownedUnitIds: string[]) => generateOperationsInsight(data, role, ownedUnitIds),
  ["analytics-insight-operations"],
  { revalidate: 3600 }
);

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeAnalytics(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`analytics-insight:${user.id}`, 30, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = await req.json().catch(() => null) as { section?: Section; filters?: AnalyticsFilters } | null;
  const section = body?.section;
  const filters = body?.filters;
  if (!section || !filters || !["executive", "revenue", "operations"].includes(section)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const scopedUser = { role: user.role, ownedUnitIds: user.ownedUnitIds };

  try {
    let result: AnalyticsInsightResult;
    if (section === "executive") {
      const kpis = await getExecutiveKPIs(scopedUser, filters);
      result = await getCachedExecutive(kpis, user.role, user.ownedUnitIds);
    } else if (section === "revenue") {
      const [revenue, financial] = await Promise.all([
        getRevenueAnalytics(scopedUser, filters),
        getFinancialAnalytics(scopedUser, filters),
      ]);
      // Drop the raw per-booking drill-down list — the chart-level rollups
      // (byUnit/bySource/byStayType/byPaymentMethod/series) are the real
      // signal; a full booking list would bloat the prompt for no benefit.
      const { bookings: _bookings, ...revenueForPrompt } = revenue;
      result = await getCachedRevenue({ revenue: revenueForPrompt, financial }, user.role, user.ownedUnitIds);
    } else {
      const [booking, occupancy, guest, housekeeping, staff, units] = await Promise.all([
        getBookingAnalytics(scopedUser, filters),
        getOccupancyAnalytics(scopedUser, filters),
        getGuestAnalytics(scopedUser, filters),
        getHousekeepingAnalytics(scopedUser, filters),
        getStaffAnalytics(scopedUser, filters),
        getUnitPerformance(scopedUser, filters),
      ]);
      const { bookings: _staffBookings, ...staffForPrompt } = staff;
      const { calendarCells: _cells, calendarDays: _days, ...occupancyForPrompt } = occupancy;
      result = await getCachedOperations(
        { booking, occupancy: occupancyForPrompt, guest, housekeeping, staff: staffForPrompt, units },
        user.role,
        user.ownedUnitIds
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("analytics-insight failed", section, e);
    // Non-critical enrichment — every existing widget already shows its
    // real numbers without this; a Gemini failure here just means no AI
    // panel renders, never an error surfaced to the viewer.
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
