import { getGuidebookSettings } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { AmenitiesSection } from "@/components/guest/GuidebookSections";
import { GALLERY } from "@/lib/galleryContent";

export default async function AmenitiesPage() {
  const g = await getGuidebookSettings();

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader image={GALLERY.amenities[0].src} icon="🛏️" title="Amenities" subtitle="Everything included in your unit." />

      <div className="mt-3">
        <AmenitiesSection amenities={g.amenities} />
      </div>

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
