import type { TileArt } from "@/lib/guideNav";
import type { UnsplashImage as UnsplashImageData } from "@/lib/unsplash/types";
import { TileCoverArt } from "@/components/guest/TileCoverArt";
import { UnsplashImage } from "@/components/guest/UnsplashImage";

/** Shared cover-photo + title header for every /guide/* page — kept as one
 * component so the ~13 dedicated Guide pages don't each hand-roll the same
 * banner markup. Pass `image` for a section with a real (business-supplied)
 * photo, `unsplashImage` for one that only has a cached Unsplash photo, or
 * `art` as the last-resort generated gradient+motif (e.g. a category whose
 * cache hasn't warmed yet) — same look as that section's hub tile, so it
 * carries through from the hub to the page itself. */
export function GuidePageHeader({
  image,
  unsplashImage,
  art,
  icon,
  title,
  subtitle,
}: {
  image?: string;
  unsplashImage?: UnsplashImageData | null;
  art?: TileArt;
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="card overflow-hidden">
      {image ? (
        <div className="aspect-[21/9] w-full bg-[var(--bg-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
        </div>
      ) : unsplashImage ? (
        <UnsplashImage image={unsplashImage} className="aspect-[21/9] w-full" priority />
      ) : art ? (
        <div className="relative aspect-[21/9] w-full">
          <TileCoverArt icon={icon} art={art} patternCount={16} />
        </div>
      ) : null}
      <div className="p-5">
        <div className="text-[26px] leading-none">{icon}</div>
        <h1 className="mt-1.5 text-[22px] font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--gray)]">{subtitle}</p>}
      </div>
    </div>
  );
}
