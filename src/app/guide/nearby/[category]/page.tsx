import { notFound } from "next/navigation";
import { getGuidebookSettings } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { NEARBY_SLUGS, type NearbySlug } from "@/lib/guideNav";
import { mapsSearchUrl, wazeUrl } from "@/lib/guideUtils";

export default async function NearbyCategoryPage({ params }: { params: { category: string } }) {
  const slug = params.category as NearbySlug;
  const meta = NEARBY_SLUGS[slug];
  if (!meta) notFound();

  const g = await getGuidebookSettings();
  const categories = g.categories.filter((c) => meta.categoryKeys.includes(c.key));

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon={meta.icon} image={meta.image} title={meta.label} subtitle="Tap a place to open directions — real distance and travel time come straight from Maps." />

      <div className="mt-3 space-y-3">
        {categories.length === 0 || categories.every((c) => c.items.length === 0) ? (
          <div className="card p-6 text-center text-[13.5px] text-[var(--gray)]">No places listed in this category yet.</div>
        ) : (
          categories.map((c) => (
            <div key={c.key} className="card p-5">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{c.icon} {c.label}</div>
              <div className="space-y-1.5">
                {c.items.map((item) => (
                  <div key={item} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3.5 py-2.5">
                    <span className="text-[13.5px] font-semibold">{item}</span>
                    <div className="flex flex-none gap-1.5">
                      <a href={mapsSearchUrl(item)} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🗺️</a>
                      <a href={wazeUrl(item)} target="_blank" rel="noopener noreferrer" className="btn-sm btn">🚗</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
