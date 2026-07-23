import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { GALLERY, GALLERY_CATEGORY_LABELS, GALLERY_CATEGORY_ORDER } from "@/lib/galleryContent";

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader image={GALLERY.hero[0].src} icon="📷" title="Gallery" subtitle="Real photos from our units — every unit is staged identically." />

      <div className="mt-3 space-y-5">
        {GALLERY_CATEGORY_ORDER.map((cat) => (
          <div key={cat} className="card p-5">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{GALLERY_CATEGORY_LABELS[cat]}</div>
            <div className="grid grid-cols-3 gap-2">
              {GALLERY[cat].map((img) => (
                <a key={img.src} href={img.src} target="_blank" rel="noopener noreferrer" className="aspect-square overflow-hidden rounded-xl bg-[var(--bg-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.alt} className="h-full w-full object-cover transition duration-300 hover:scale-105" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
