import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { generateDashboardInsight, type DashboardInsightMetrics } from "@/lib/ai/dashboardInsight";
import { rateLimit } from "@/lib/rateLimit";

// Cached per exact metrics snapshot (unstable_cache incorporates the
// function's arguments into its cache key) — repeated dashboard loads with
// unchanged numbers never re-hit Gemini; a real change in the underlying
// figures naturally busts the cache. 10min covers a normal browsing
// session without costing a fresh call on every page revisit.
const getCachedInsight = unstable_cache(
  (metrics: DashboardInsightMetrics) => generateDashboardInsight(metrics),
  ["dashboard-insight"],
  { revalidate: 600 }
);

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeDashboard(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`dashboard-insight:${user.id}`, 20, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const metrics = await req.json().catch(() => null) as DashboardInsightMetrics | null;
  if (!metrics || typeof metrics !== "object") {
    return NextResponse.json({ error: "Invalid metrics." }, { status: 400 });
  }

  try {
    const insight = await getCachedInsight(metrics);
    return NextResponse.json({ insight });
  } catch {
    // Non-critical cosmetic upgrade — the Dashboard already has a solid
    // template fallback, so a Gemini failure here is never surfaced as an
    // error to the client, just an empty response it ignores.
    return NextResponse.json({ insight: null });
  }
}
