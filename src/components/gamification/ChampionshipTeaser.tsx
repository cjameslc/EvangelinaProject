"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Teaser = {
  campaignId: string;
  hasParticipants: boolean;
  isParticipant: boolean;
  rank: number | null;
  totalParticipants: number;
  targetAchieved: boolean;
  motivation: string | null;
  winnerName: string | null;
};

const SEEN_KEY = "championship-teaser-seen";

/**
 * A small, deliberately quiet entry point to the Sales Championship —
 * lives on the Bookings tab (the page staff actually open "tens of times a
 * day", per the frequency test that governs whether/how something here
 * should animate) instead of a persistent nav tab, so it never competes
 * for attention with the work itself.
 *
 * Animation budget spent carefully:
 * - The badge's own entrance (a small bounce-in) plays exactly once per
 *   browser session, not on every page view — gated by sessionStorage, the
 *   same "surprise, not decoration" distinction the brief asked for.
 * - After that first reveal it sits still. No looping shimmer/pulse in the
 *   idle state — that's the "tens of times/day: remove or drastically
 *   reduce" rule in practice, not just in principle.
 * - The only thing that can move again later is a single small dot when
 *   there's something genuinely worth a glance (you're #1, or the target's
 *   been hit) — a real state signal, not ambient decoration.
 * - The reveal popover scales in from the badge itself (transform-origin
 *   at the trigger, not centered) and is a plain CSS transition, not a
 *   keyframe, so a fast re-open/close never looks like it's restarting.
 */
const POPOVER_WIDTH = 260;

export function ChampionshipTeaser() {
  const [teaser, setTeaser] = useState<Teaser | null>(null);
  const [open, setOpen] = useState(false);
  const [firstReveal, setFirstReveal] = useState(false);
  // Which edge the popover grows from — measured fresh on every open, not
  // assumed. This badge's position in the page varies (flush against the
  // left edge for a role with no "Add booking" button next to it, further
  // right when it is), so a fixed right-0/grow-left anchor pushed the
  // popover off the left edge of the viewport entirely on mobile — the
  // actual bug report this fixes. Defaults to "right" (grow-left, the
  // original behavior) until measured, matching desktop's common case.
  const [align, setAlign] = useState<"left" | "right">("right");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/gamification/campaign?light=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const t: Teaser | null = j?.teaser ?? null;
        if (!t || !t.hasParticipants) return;
        setTeaser(t);
        if (typeof window !== "undefined" && !window.sessionStorage.getItem(SEEN_KEY)) {
          window.sessionStorage.setItem(SEEN_KEY, "1");
          setFirstReveal(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!teaser) return null;

  const hot = teaser.rank === 1 || teaser.targetAchieved;
  const headline = teaser.isParticipant
    ? teaser.motivation ?? "See how you're doing in the Championship."
    : teaser.targetAchieved && teaser.winnerName
      ? `🏆 Target hit — ${teaser.winnerName} is leading.`
      : "🏆 The Sales Championship is live — see who's winning.";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next && wrapRef.current) {
              const rect = wrapRef.current.getBoundingClientRect();
              const spaceRight = window.innerWidth - rect.left;
              // Grow rightward (left-0) whenever there's room; only fall
              // back to growing leftward (right-0) when there genuinely
              // isn't — never the reverse of what actually fits.
              setAlign(spaceRight >= POPOVER_WIDTH + 16 ? "left" : "right");
            }
            return next;
          });
        }}
        aria-label="Sales Championship"
        aria-expanded={open}
        className={cn(
          "relative grid h-10 w-10 flex-none place-items-center rounded-full text-[18px] text-white shadow-s transition duration-150 [transition-timing-function:var(--ease-out)] active:scale-90",
          firstReveal && "animate-pop-in"
        )}
        style={{ background: "linear-gradient(135deg, #4a1a6e 0%, #7a1f4d 100%)" }}
      >
        🏆
        {hot && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pop-in rounded-full border-2 border-[var(--card)]" style={{ background: teaser.targetAchieved ? "#FFD770" : "#FF385C" }} aria-hidden />
        )}
      </button>

      <div
        className={cn(
          "absolute top-[calc(100%+8px)] z-20 w-[260px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-left shadow-card transition duration-150 [transition-timing-function:var(--ease-out)]",
          align === "left" ? "left-0 origin-top-left" : "right-0 origin-top-right",
          open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        )}
      >
        <div className="text-[13px] font-bold leading-snug">{headline}</div>
        {teaser.isParticipant && teaser.rank && (
          <div className="mt-1.5 text-[11.5px] font-semibold text-[var(--gray)]">
            Rank #{teaser.rank} of {teaser.totalParticipants}
          </div>
        )}
        <Link
          href="/gamification"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#4a1a6e] to-[#7a1f4d] px-3 py-2 text-[12.5px] font-extrabold text-white transition duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]"
        >
          View Championship →
        </Link>
      </div>
    </div>
  );
}
