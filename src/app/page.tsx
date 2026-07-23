import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { getViewMode } from "@/lib/viewMode";
import { getGuidebookSettings } from "@/lib/guidebookService";
import { getPlaceInsightsByNames } from "@/lib/places/placeInsightService";
import { NEARBY_SLUGS, type NearbySlug } from "@/lib/guideNav";
import { GuideHubView, type NearbySummary } from "@/components/guest/GuideHubView";

export default async function Home() {
  const user = await getCurrentUser();
  // Staff redirect logic — unchanged, UNLESS this employee has switched to
  // Travel Mode (Navbar's mode toggle), in which case they fall through to
  // the same guest homepage below instead of being bounced to their staff
  // page. Their staff session/access is untouched either way — this only
  // changes what "/" renders for them, not what they're allowed to reach.
  if (user && getViewMode() === "staff") {
    if (canSeeDashboard(user.role)) redirect("/dashboard");
    if (user.role === "AUDITOR") redirect("/auditor");
    redirect("/bookings");
  }

  // No staff session (or a staff session in Travel Mode) — render the
  // Guest Experience tile hub, the app's default landing page per the
  // Guest Experience Module spec. Completely independent of Booking (see
  // /book and BookFlowView) — this page links out to booking, it never
  // renders booking content itself. (middleware.ts's authorized callback
  // special-cases "/" to make this reachable unauthenticated.)
  const g = await getGuidebookSettings();

  // Real walk/drive time from the property (Urban Deca Towers Cubao) to
  // the nearest real place in each "Explore the neighborhood" category —
  // shown right on the hub tile so a guest gets a sense of distance before
  // even opening it. Computed from the same Google-sourced PlaceInsight
  // data the category pages themselves use (see placeInsightService.ts) —
  // never a fabricated/estimated number, and a category with no refreshed
  // data yet just falls back to its plain subtitle.
  const allItems = g.categories.flatMap((c) => c.items);
  const insightsByName = await getPlaceInsightsByNames(allItems);
  const nearbySummaries: Partial<Record<NearbySlug, NearbySummary>> = {};
  for (const [slug, meta] of Object.entries(NEARBY_SLUGS) as [NearbySlug, (typeof NEARBY_SLUGS)[NearbySlug]][]) {
    const items = g.categories.filter((c) => meta.categoryKeys.includes(c.key)).flatMap((c) => c.items);
    let nearest: NearbySummary | null = null;
    for (const item of items) {
      const insight = insightsByName.get(item);
      if (!insight || insight.distanceMeters == null) continue;
      if (!nearest || insight.distanceMeters < nearest.distanceMeters) {
        nearest = { distanceMeters: insight.distanceMeters, walkMinutes: insight.walkMinutes, driveMinutes: insight.driveMinutes };
      }
    }
    if (nearest) nearbySummaries[slug] = nearest;
  }

  return <GuideHubView hostName={g.hostName} nearbySummaries={nearbySummaries} />;
}
