import { getGuidebookSettingsForCurrentGuest } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { AmenitiesSection } from "@/components/guest/GuidebookSections";
import { UnsplashImage } from "@/components/guest/UnsplashImage";
import { GALLERY } from "@/lib/galleryContent";
import { getCategoryImagesBatch } from "@/lib/unsplash/service";
import { pickStable } from "@/lib/unsplash/pick";
import { AMENITY_UNSPLASH_CATEGORIES } from "@/lib/unsplash/tileCategories";

export default async function AmenitiesPage() {
  const [g, amenityImageBatch] = await Promise.all([
    getGuidebookSettingsForCurrentGuest(),
    getCategoryImagesBatch(AMENITY_UNSPLASH_CATEGORIES.map((a) => a.category)),
  ]);

  // Only keep entries whose fixed AMENITIES label (guidebookContent.ts) is
  // actually offered here AND whose category cache has an image — a
  // property-specific spec change to that content never produces a
  // mismatched photo.
  const offeredLabels = new Set(g.amenities.map((a) => a.label));
  const featured = AMENITY_UNSPLASH_CATEGORIES.filter((a) => offeredLabels.has(a.label))
    .map((a) => ({ ...a, image: pickStable(amenityImageBatch[a.category] ?? [], a.category) }))
    .filter((a) => a.image);

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader image={GALLERY.amenities[0].src} icon="🛏️" title="Amenities" subtitle="Everything included in your unit." />

      <div className="mt-3">
        <AmenitiesSection amenities={g.amenities} />
      </div>

      {featured.length > 0 && (
        <div className="card mt-3 p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">✨ Suite features</div>
          <div className="grid grid-cols-3 gap-2">
            {featured.map((a) => (
              <div key={a.category} className="overflow-hidden rounded-xl bg-[var(--bg-2)]">
                <UnsplashImage image={a.image} alt={a.title} className="aspect-square" sizes="150px" />
                <div className="px-1.5 py-1.5 text-[10.5px] font-bold leading-tight">{a.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-3 p-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">📷 In the unit</div>
        <div className="grid grid-cols-3 gap-2">
          {GALLERY.amenities.slice(1).map((img) => (
            <div key={img.src} className="aspect-square overflow-hidden rounded-xl bg-[var(--bg-2)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
