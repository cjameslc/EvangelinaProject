"use client";

import { useSeasonalSkin } from "./SeasonalSkinProvider";
import { SeasonalAmbience } from "./SeasonalAmbience";

/**
 * Marketing page's "Seasonal Spotlight" banner — a real, licensed photo
 * (see spotlight in src/lib/skins/config.ts, always credited) plus the
 * skin's own message, sitting between the hero and the units grid. This is
 * additive to CinematicHero (which only ever shows real unit photos) —
 * the one place this app shows a stock photo, and only while a seasonal
 * skin is active. Renders nothing for the default skin.
 */
export function SeasonalSpotlight() {
  const skin = useSeasonalSkin();
  if (skin.id === "evangelina" || !skin.spotlight) return null;
  const { imageUrl, imageAlt, credit, message } = skin.spotlight;

  return (
    <div className="relative isolate overflow-hidden">
      <div className="relative min-h-[280px] sm:min-h-[340px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(100deg, ${skin.colors.primary}E6 0%, ${skin.colors.primary}99 32%, ${skin.colors.secondary}4D 68%, transparent 100%)` }}
        />
        <SeasonalAmbience count={14} />

        <div className="relative flex h-full min-h-[280px] items-center px-6 py-14 sm:min-h-[340px] sm:px-12">
          <div className="max-w-[560px]">
            <span
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/15 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm"
            >
              {skin.emoji} {skin.name}
            </span>
            <p className="mt-4 text-[18px] font-medium italic leading-relaxed text-white text-balance sm:text-[22px]">
              {message}
            </p>
          </div>
        </div>

        <span className="absolute bottom-2 right-3 text-[10px] font-medium text-white/60">{credit}</span>
      </div>
    </div>
  );
}
