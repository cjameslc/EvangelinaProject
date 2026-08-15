import { GUIDE_SECTIONS, type NearbySlug } from "@/lib/guideNav";
import { manilaTimeGreeting } from "@/lib/manilaTime";
import type { UnsplashImage as UnsplashImageData } from "@/lib/unsplash/types";
import { TileCoverArt } from "@/components/guest/TileCoverArt";
import { UnsplashImage } from "@/components/guest/UnsplashImage";
import { TransitionLink } from "@/components/guest/TransitionLink";
import { BookingUnlockCard } from "@/components/guest/BookingUnlockCard";

export type NearbySummary = { distanceMeters: number; walkMinutes: number | null; driveMinutes: number | null };

/** Real distance/time from the property to the nearest place in that
 * category — never a fabricated estimate. Walking preferred when it's a
 * reasonable distance; otherwise driving. */
function nearbyBadge(s: NearbySummary): string | null {
  if (s.walkMinutes != null && s.walkMinutes <= 25) return `🚶 ${s.walkMinutes} min`;
  if (s.driveMinutes != null) return `🚗 ${s.driveMinutes} min`;
  if (s.walkMinutes != null) return `🚶 ${s.walkMinutes} min`;
  return null;
}

/**
 * The default landing page: an image-first tile grid grouped into scannable
 * sections, completely independent of the Booking module (see BookFlowView
 * for the separate booking flow). Every section in GUIDE_SECTIONS ships
 * with exactly 4 tiles, so the grid stays a fixed 4 columns at every
 * breakpoint (more columns would just leave empty trailing tracks) — tiles
 * grow larger via the widening max-width/gap instead, so desktop fills its
 * space instead of shrinking the same small phone-sized card into a sea of
 * whitespace. Tiles use TransitionLink so opening one animates smoothly
 * (same window, no new tab) instead of an abrupt page swap.
 */
export function GuideHubView({
  hostName,
  nearbySummaries = {},
  showBookingUnlock = false,
  unsplashTileImages = {},
}: {
  hostName: string | null;
  /** Keyed by NearbySlug — real walk/drive time to the nearest place in
   * that "Explore the neighborhood" category, from Urban Deca Towers
   * Cubao. Only categories with refreshed Google Places data get a badge;
   * everything else falls back to its plain subtitle. */
  nearbySummaries?: Partial<Record<NearbySlug, NearbySummary>>;
  /** Only shown to a visitor with no active guest session — a guest who's
   * already signed in has no need to "unlock" anything, their own bookings
   * are already one tap away via My bookings. */
  showBookingUnlock?: boolean;
  /** Real Unsplash photos for the handful of "Explore the neighborhood"
   * tiles that have no real business photo (see NEARBY_UNSPLASH_CATEGORY)
   * — everything else keeps its real GALLERY/CATEGORY_COVER_PHOTOS image
   * untouched. Falls back to the tile's generated art if a category's
   * cache is empty. */
  unsplashTileImages?: Partial<Record<NearbySlug, UnsplashImageData>>;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-14 lg:max-w-[1320px]">
      <div className="mb-6 text-center sm:mb-10">
        <div className="text-[11px] font-bold uppercase tracking-wide text-rausch">Digital Guidebook</div>
        <h1 className="mt-1 text-[24px] font-extrabold tracking-tight sm:text-[38px]">
          Welcome to Evangelina&apos;s Staycation
        </h1>
        <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-relaxed text-[var(--gray)] sm:text-[14.5px]">
          {manilaTimeGreeting()}! Everything you need for your stay in one place{hostName ? ` — hosted by ${hostName}` : ""}. Browse below, or{" "}
          <TransitionLink href="/book" className="font-bold text-rausch hover:underline">book a unit</TransitionLink>.
        </p>
        {showBookingUnlock && (
          <div className="mt-5">
            <BookingUnlockCard />
          </div>
        )}
      </div>

      <div className="space-y-6 sm:space-y-9">
        {GUIDE_SECTIONS.map((section) => (
          <div key={section.label}>
            <h2 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)] sm:mb-3.5 sm:text-[13px]">{section.label}</h2>
            <div className="grid grid-cols-4 gap-2 sm:gap-3 md:gap-4 lg:gap-5">
              {section.tiles.map((tile) => {
                const slug = tile.href.startsWith("/guide/nearby/") ? (tile.href.split("/").pop() as NearbySlug) : null;
                const summary = slug ? nearbySummaries[slug] : undefined;
                const badge = summary ? nearbyBadge(summary) : null;
                const unsplashImage = slug ? unsplashTileImages[slug] : undefined;
                return (
                  <TransitionLink
                    key={tile.key}
                    href={tile.href}
                    className="group relative flex aspect-square flex-col justify-end overflow-hidden rounded-xl bg-[var(--bg-2)] shadow-s transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(0,0,0,.22)] active:scale-[0.96] active:duration-100 sm:aspect-[4/5] sm:rounded-2xl"
                  >
                    {tile.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tile.image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : unsplashImage ? (
                      <UnsplashImage
                        image={unsplashImage}
                        alt=""
                        className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-110"
                        sizes="200px"
                        // This tile is itself a TransitionLink (renders an <a>);
                        // UnsplashImage's attribution is also an <a>, and a
                        // nested anchor is invalid HTML that breaks hydration.
                        // Full-size, non-linked usages (GuidePageHeader) still
                        // show it.
                        showAttribution={false}
                      />
                    ) : tile.art ? (
                      <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-110">
                        <TileCoverArt icon={tile.icon} art={tile.art} size="sm" />
                      </div>
                    ) : null}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                    {badge && (
                      <div className="absolute right-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[8.5px] font-bold text-white backdrop-blur-sm sm:right-2 sm:top-2 sm:px-2 sm:py-1 sm:text-[10.5px]">
                        {badge}
                      </div>
                    )}
                    <div className="relative z-10 p-1.5 sm:p-3 md:p-3.5">
                      <div className="text-[13px] leading-none drop-shadow sm:text-[20px] md:text-[24px]">{tile.icon}</div>
                      <div className="mt-1 line-clamp-2 text-[9px] font-extrabold leading-tight text-white drop-shadow sm:mt-1.5 sm:text-[13px] md:text-[15px]">{tile.title}</div>
                      <div className="mt-0.5 hidden text-[11px] leading-snug text-white/85 drop-shadow sm:block md:text-[11.5px]">{tile.subtitle}</div>
                    </div>
                  </TransitionLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
