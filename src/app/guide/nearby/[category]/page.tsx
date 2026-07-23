import { notFound } from "next/navigation";
import { getGuidebookSettings } from "@/lib/guidebookService";
import { getPlaceInsightsByNames } from "@/lib/places/placeInsightService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { PlaceInsightRow, type PlaceInsightData } from "@/components/guest/PlaceInsightRow";
import { NEARBY_SLUGS, type NearbySlug } from "@/lib/guideNav";

export default async function NearbyCategoryPage({ params }: { params: { category: string } }) {
  const slug = params.category as NearbySlug;
  const meta = NEARBY_SLUGS[slug];
  if (!meta) notFound();

  const g = await getGuidebookSettings();
  const categories = g.categories.filter((c) => meta.categoryKeys.includes(c.key));
  const insightRows = await getPlaceInsightsByNames(categories.flatMap((c) => c.items));
  const insights: Record<string, PlaceInsightData> = JSON.parse(JSON.stringify(Object.fromEntries(insightRows)));

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon={meta.icon} image={meta.image} title={meta.label} subtitle="Real distance, hours, and rating where available — tap a place to open directions." />

      <div className="mt-3 space-y-3">
        {categories.length === 0 || categories.every((c) => c.items.length === 0) ? (
          <div className="card p-6 text-center text-[13.5px] text-[var(--gray)]">No places listed in this category yet.</div>
        ) : (
          categories.map((c) => (
            <div key={c.key} className="card p-5">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{c.icon} {c.label}</div>
              <div className="space-y-1.5">
                {c.items.map((item) => (
                  <PlaceInsightRow key={item} name={item} insight={insights[item]} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
