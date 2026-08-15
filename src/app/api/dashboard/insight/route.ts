import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { generateDashboardInsight, type DashboardInsightMetrics, type BusinessContext } from "@/lib/ai/dashboardInsight";
import { rateLimit } from "@/lib/rateLimit";

// Cached per exact metrics snapshot + business context (unstable_cache
// incorporates the function's arguments into its cache key) — repeated
// dashboard loads with unchanged numbers never re-hit Gemini; a real
// change in the underlying figures naturally busts the cache. 10min
// covers a normal browsing session without costing a fresh call on every
// page revisit.
const getCachedInsight = unstable_cache(
  (metrics: DashboardInsightMetrics, business: BusinessContext) => generateDashboardInsight(metrics, business),
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
    const [owner, unitCount] = await Promise.all([
      prisma.owner.findUnique({ where: { id: user.ownerId! }, select: { businessName: true } }),
      prisma.unit.count({ where: { ownerId: user.ownerId, active: true } }),
    ]);
    const settings = await prisma.settings.findUnique({ where: { ownerId: user.ownerId! }, select: { address: true } });
    const business: BusinessContext = {
      businessName: owner?.businessName ?? "Evangelina's Staycation",
      unitCount: unitCount || 1,
      address: settings?.address ?? "Cubao, Quezon City, Philippines",
    };
    const insight = await getCachedInsight(metrics, business);
    return NextResponse.json({ insight });
  } catch {
    // Non-critical cosmetic upgrade — the Dashboard already has a solid
    // template fallback, so a Gemini failure here is never surfaced as an
    // error to the client, just an empty response it ignores.
    return NextResponse.json({ insight: null });
  }
}
