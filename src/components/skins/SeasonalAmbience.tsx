"use client";

import { useSeasonalSkin } from "./SeasonalSkinProvider";
import type { CSSProperties } from "react";

/**
 * Skin-driven floating decoration layer — one shared implementation for
 * every seasonal skin (snowflakes, lanterns, petals, sparkles...); config
 * only supplies which emoji float (see decorationEmojis in
 * src/lib/skins/types.ts). Mirrors the existing Confetti-reuse principle:
 * don't build a bespoke ambience effect per skin, drive one effect from
 * data. Renders nothing for the default skin or any skin with no
 * decorationEmojis — Evangelina Violet must stay a visual no-op.
 *
 * Purely decorative: absolutely positioned, pointer-events-none, aria-hidden.
 * Respects prefers-reduced-motion via the app-wide animation-duration
 * override in globals.css (no separate handling needed here).
 */
export function SeasonalAmbience({ count = 16, className = "" }: { count?: number; className?: string }) {
  const skin = useSeasonalSkin();
  if (skin.id === "evangelina" || skin.decorationEmojis.length === 0) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const emoji = skin.decorationEmojis[i % skin.decorationEmojis.length];
        const left = (i * 61.8) % 100;
        // Mostly frame the top/bottom edges rather than drift over the
        // center, where a headline usually sits — only every 5th particle
        // wanders into the middle band, keeping text legible without
        // making the effect look confined to a thin strip.
        const top = i % 5 === 0 ? 34 + ((i * 23) % 34) : i % 2 === 0 ? (i * 19) % 22 : 78 + ((i * 19) % 20);
        const size = 14 + (i % 4) * 5;
        const duration = 5 + (i % 6);
        const delay = (i % 8) * 0.55;
        const driftX = ((i % 5) - 2) * 14;
        const driftY = -16 - (i % 4) * 10;
        const rotate = (i % 2 === 0 ? 1 : -1) * (6 + (i % 4) * 4);
        const style: CSSProperties & Record<string, string | number> = {
          left: `${left}%`,
          top: `${top}%`,
          fontSize: size,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          "--sd-drift-x": `${driftX}px`,
          "--sd-drift-y": `${driftY}px`,
          "--sd-rotate": `${rotate}deg`,
          "--sd-opacity": 0.75,
        };
        return (
          <span key={i} className="absolute select-none animate-seasonal-drift" style={style}>
            {emoji}
          </span>
        );
      })}
    </div>
  );
}
