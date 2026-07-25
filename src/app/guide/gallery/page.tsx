import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { GalleryMasonry } from "@/components/guest/GalleryLightbox";
import { GALLERY, GALLERY_CATEGORY_LABELS, GALLERY_CATEGORY_ORDER } from "@/lib/galleryContent";

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader image={GALLERY.hero[0].src} icon="📷" title="Gallery" subtitle="Real photos from our units — every unit is staged identically. Tap any photo for a closer look." />

      <div className="mt-3 space-y-5">
        {GALLERY_CATEGORY_ORDER.map((cat) => (
          <div key={cat} className="card p-5">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{GALLERY_CATEGORY_LABELS[cat]}</div>
            <GalleryMasonry items={GALLERY[cat].map((img) => ({ ...img, category: cat }))} />
          </div>
        ))}
      </div>
    </div>
  );
}
