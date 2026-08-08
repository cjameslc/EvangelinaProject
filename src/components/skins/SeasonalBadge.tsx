"use client";

import { useSeasonalSkin } from "./SeasonalSkinProvider";

/**
 * Low-intensity skin indicator — an emoji + name pill, nothing more. For
 * surfaces the brief explicitly wants kept subtle/professional (Admin,
 * Maintenance — see "Staff Experience" intensity table). Renders nothing
 * at all while Evangelina Violet (the default/no-event state) is active,
 * since there's nothing seasonal to announce — unless `showDefault` is
 * set (the Metrics dashboard header explicitly wants "💜 Evangelina
 * Violet" shown even with no event active, brief section 4), which every
 * other caller leaves off rather than changing their own behavior.
 */
export function SeasonalBadge({ className = "", showDefault = false }: { className?: string; showDefault?: boolean }) {
  const skin = useSeasonalSkin();
  if (skin.id === "evangelina" && !showDefault) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${className}`}
      style={{ borderColor: `${skin.colors.primary}40`, color: skin.colors.primary, background: `${skin.colors.primary}0F` }}
      title={skin.fullName}
    >
      <span aria-hidden="true">{skin.emoji}</span> {skin.name}
    </span>
  );
}
