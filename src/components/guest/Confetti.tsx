"use client";

import { useMemo } from "react";

const DEFAULT_COLORS = ["#FF385C", "#FFB400", "#00A699", "#6C5CE7", "#0EA5A0", "#FF7A5C"];

/** Pure CSS confetti burst — no canvas-confetti dependency needed for a
 * one-time celebration on the feedback success screen. ~70 pieces, each a
 * random color/rotation/fall-duration, fixed-positioned over the whole
 * viewport, pointer-events disabled so it never blocks the voucher card
 * underneath. `colors` defaults to the original palette — the Seasonal
 * Skin System's celebrate() (src/lib/skins/celebrate.ts) passes the active
 * skin's own confetti colors through this same prop rather than a second
 * confetti implementation. The animation itself is skipped entirely under
 * prefers-reduced-motion (see the animate-confetti-fall override in
 * globals.css) — this component still renders its pieces so the DOM is
 * identical either way, they just don't fall/spin. */
export function Confetti({ count = 70, colors = DEFAULT_COLORS }: { count?: number; colors?: string[] }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.6 + Math.random() * 1.6,
        color: colors[i % colors.length],
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 120,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, colors.join(",")]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti-fall absolute top-[-5%] rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // @ts-expect-error custom property read by the keyframes below
            "--confetti-drift": `${p.drift}px`,
            "--confetti-rotate": `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}
