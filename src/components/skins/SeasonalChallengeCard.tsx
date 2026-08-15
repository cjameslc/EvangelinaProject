"use client";

import { useSeasonalSkin } from "./SeasonalSkinProvider";

/**
 * The Booker "challenge board" (brief section 19/20) — real booking data
 * (`current`/`target`, both counted/set by the caller from actual
 * bookingsMonth rows, never fabricated) presented with the active skin's
 * title/subtitle/color. Medium-high intensity: a progress bar and a
 * motivational framing, not a literal game — the underlying number is
 * still just "how many bookings this Booker logged this month," shown
 * plainly right below the bar.
 */
export function SeasonalChallengeCard({ current, target, title, subtitle }: { current: number; target: number; title?: string; subtitle?: string }) {
  const skin = useSeasonalSkin();
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const remaining = Math.max(0, target - current);

  return (
    <div
      className="card relative overflow-hidden p-4"
      style={{
        background: `linear-gradient(135deg, ${skin.colors.surfaceFrom}, ${skin.colors.surfaceTo})`,
        borderColor: `${skin.colors.primary}30`,
        boxShadow: skin.id === "evangelina" ? undefined : `0 6px 24px -8px ${skin.colors.glow}`,
      }}
    >
      {/* Oversized low-opacity watermark — one static glyph, not animated,
          so operational cards (Booker/Housekeeping) stay noticeably
          seasonal without competing with the real numbers for attention. */}
      {skin.id !== "evangelina" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-3 -top-4 select-none text-[70px] leading-none opacity-[0.14]"
          style={{ transform: "rotate(12deg)" }}
        >
          {skin.emoji}
        </span>
      )}
      <div className="relative flex items-center gap-2 text-[13.5px] font-extrabold" style={{ color: skin.colors.primary }}>
        <span aria-hidden="true">{skin.emoji}</span>
        <span>{title ?? skin.messaging.bookerChallengeTitle}</span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--gray)]">{subtitle ?? skin.messaging.bookerChallengeSub}</p>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[26px] font-extrabold tracking-tight text-[var(--ink)]">{current}</span>
        <span className="text-[14px] font-bold text-[var(--gray)]">/ {target}</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${skin.colors.primary}, ${skin.colors.secondary})` }}
        />
      </div>
      <p className="mt-2 text-[12px] font-semibold text-[var(--gray)]">
        {remaining > 0 ? `${remaining} more booking${remaining === 1 ? "" : "s"} to reach your goal` : "Goal reached — nice work!"}
      </p>
    </div>
  );
}
