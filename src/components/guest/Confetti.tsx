"use client";

import { useMemo } from "react";

const COLORS = ["#FF385C", "#FFB400", "#00A699", "#6C5CE7", "#0EA5A0", "#FF7A5C"];

/** Pure CSS confetti burst — no canvas-confetti dependency needed for a
 * one-time celebration on the feedback success screen. ~70 pieces, each a
 * random color/rotation/fall-duration, fixed-positioned over the whole
 * viewport, pointer-events disabled so it never blocks the voucher card
 * underneath. */
export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.6 + Math.random() * 1.6,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 120,
      })),
    [count]
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
