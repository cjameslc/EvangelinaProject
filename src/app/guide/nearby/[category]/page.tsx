import { notFound } from "next/navigation";
import { getGuidebookSettings } from "@/lib/guidebookService";
import { getPlaceInsightsByNames } from "@/lib/places/placeInsightService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { NearbyCategoryList } from "@/components/guest/NearbyCategoryList";
import type { PlaceInsightData } from "@/components/guest/PlaceInsightRow";
import { NEARBY_SLUGS, type NearbySlug } from "@/lib/guideNav";
import { googleSearchUrl } from "@/lib/guideUtils";

export default async function NearbyCategoryPage({ params }: { params: { category: string } }) {
  const slug = params.category as NearbySlug;
  const meta = NEARBY_SLUGS[slug];
  if (!meta) notFound();

  const g = await getGuidebookSettings();
  const categories = g.categories.filter((c) => meta.categoryKeys.includes(c.key));
  const insightRows = await getPlaceInsightsByNames(categories.flatMap((c) => c.items));
  const insights: Record<string, PlaceInsightData> = JSON.parse(JSON.stringify(Object.fromEntries(insightRows)));
  const origin = g.propertyLat != null && g.propertyLng != null ? { lat: g.propertyLat, lng: g.propertyLng } : null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon={meta.icon} image={meta.image} art={meta.art} title={meta.label} subtitle="Real distance, hours, and rating where available — tap a place to open directions." />

      {slug === "concert" && (
        <a
          href={googleSearchUrl("Smart Araneta Coliseum upcoming events")}
          target="_blank"
          rel="noopener noreferrer"
          className="card mt-3 flex items-center justify-between p-4 transition hover:-translate-y-0.5 hover:shadow-s"
        >
          <div>
            <div className="text-[13.5px] font-extrabold">🎟️ Check what's on now</div>
            <p className="mt-0.5 text-[12px] text-[var(--gray)]">Live search for upcoming concerts &amp; events at Smart Araneta Coliseum</p>
          </div>
          <span className="text-[18px] text-[var(--gray)]">→</span>
        </a>
      )}

      <div className="mt-3">
        <NearbyCategoryList categories={categories} insights={insights} origin={origin} />
      </div>
    </div>
  );
}
