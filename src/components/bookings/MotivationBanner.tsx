"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { TrophyIcon, RocketIcon, SunriseIcon, SparkleIcon, CalendarIcon } from "@/components/ui/Icons";
import { Confetti } from "@/components/guest/Confetti";
import { cn } from "@/lib/utils";

type BannerState = "full" | "partial" | "empty";

const COPY: Record<BannerState, { headline: string; message: string }> = {
  full: {
    headline: "🎉 Congrats Team! We're Fully Booked Today!",
    message: "Outstanding work! Every available unit has been booked today. Thank you for your hard work—let's keep the momentum going!",
  },
  partial: {
    headline: "🚀 Let's Fill Today's Remaining Slots!",
    message: "We're almost there! There are still available units today. Keep responding to inquiries and let's make today another successful day.",
  },
  empty: {
    headline: "💪 Every Great Day Starts with the First Booking!",
    message: "Today is a fresh opportunity. Reach out to guests, post on social media, and follow up on inquiries. Your next message could become today's first booking.",
  },
};

/** Counts a number up from 0 on mount/change — same easing shape as the
 * Elite Booker world map's counter (WorldMapProgress.tsx's useCountUp), a
 * lighter local copy since this only ever animates a small unit count. */
function useCountUp(target: number, durationMs = 800) {
  const [value, setValue] = useState(target);
  const prefersReduced = useReducedMotion();
  useEffect(() => {
    if (prefersReduced) { setValue(target); return; }
    let raf: number;
    let start: number | null = null;
    function step(ts: number) {
      if (start === null) start = ts;
      const pct = Math.min(1, (ts - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - pct, 3))));
      if (pct < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, prefersReduced]);
  return value;
}

/**
 * Compact, always-visible banner at the top of the Bookings tab that reads
 * today's real occupancy (same `bookings` state every other section on this
 * page already derives from — see BookingsView's `bookings today` count) and
 * shows one of three states. Purely additive: renders above the existing
 * page content, touches no other section's markup, and reuses this app's
 * own design tokens (rausch/amber/teal, the "float"/"glow-pulse" keyframes
 * already in tailwind.config.ts, the existing Confetti piece) rather than
 * introducing a new visual language.
 */
export function MotivationBanner({
  occupiedUnits,
  totalUnits,
  onFillSlots,
  canEdit = true,
}: {
  occupiedUnits: number;
  totalUnits: number;
  onFillSlots: () => void;
  canEdit?: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const pct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const state: BannerState = totalUnits > 0 && occupiedUnits >= totalUnits ? "full" : occupiedUnits === 0 ? "empty" : "partial";
  const copy = COPY[state];
  const animatedOccupied = useCountUp(occupiedUnits);

  // Confetti only once per visit to this page, the moment the day first
  // reads as fully booked — never replayed on every re-render while the
  // state stays "full" (e.g. a later edit that keeps every unit booked).
  const [showConfetti, setShowConfetti] = useState(false);
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (state !== "full" || celebratedRef.current || prefersReduced) return;
    celebratedRef.current = true;
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 2600);
    return () => clearTimeout(t);
  }, [state, prefersReduced]);

  const barColor = state === "full" ? "#008A05" : state === "partial" ? "#FF385C" : "#C87D00";

  return (
    <div className="relative mb-5 max-h-40 overflow-hidden">
      {showConfetti && <Confetti count={50} />}
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: -12 }}
          animate={{
            opacity: 1, y: 0,
            scale: prefersReduced ? 1 : [1, 1.006, 1],
          }}
          exit={{ opacity: 0, y: -8 }}
          transition={{
            opacity: { duration: 0.35, ease: "easeOut" },
            y: { duration: 0.35, ease: "easeOut" },
            scale: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
          }}
          className={cn(
            "relative overflow-hidden rounded-2xl border p-4 sm:p-4.5",
            state === "full" && "border-green/25 bg-gradient-to-br from-green/10 via-transparent to-transparent shadow-[0_0_0_1px_rgba(0,138,5,0.06),0_8px_24px_-12px_rgba(0,138,5,0.35)]",
            state === "partial" && "border-rausch/20 bg-gradient-to-br from-rausch/10 via-transparent to-transparent",
            state === "empty" && "border-amber/20 bg-gradient-to-br from-amber/10 via-transparent to-transparent"
          )}
        >
          {/* Ambient decoration per state — purely visual, no layout weight. */}
          {state === "full" && !prefersReduced && (
            <SparkleIcon className="pointer-events-none absolute right-16 top-3 h-4 w-4 animate-float text-green/50" style={{ animationDelay: "0.3s" }} />
          )}
          {state === "partial" && !prefersReduced && (
            <>
              <SparkleIcon className="pointer-events-none absolute right-20 top-4 h-3 w-3 animate-float text-rausch/40" />
              <SparkleIcon className="pointer-events-none absolute right-10 top-8 h-2.5 w-2.5 animate-float text-rausch/30" style={{ animationDelay: "0.8s" }} />
            </>
          )}
          {state === "empty" && !prefersReduced && (
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_15%_0%,rgba(200,125,0,0.12),transparent)]" />
          )}

          <div className="relative flex flex-wrap items-center gap-3.5">
            <div
              className={cn(
                "flex h-11 w-11 flex-none items-center justify-center rounded-full",
                state === "full" && "bg-green/15 text-green",
                state === "partial" && "bg-rausch/15 text-rausch",
                state === "empty" && "bg-amber/15 text-amber"
              )}
            >
              <motion.div
                animate={prefersReduced ? undefined : state === "full" ? { y: [0, -3, 0] } : state === "empty" ? { y: [0, -2, 0] } : undefined}
                transition={{ duration: state === "full" ? 1.6 : 2.8, repeat: Infinity, ease: "easeInOut" }}
                className={state === "partial" && !prefersReduced ? "animate-float" : undefined}
              >
                {state === "full" && <TrophyIcon className="h-5 w-5" />}
                {state === "partial" && <RocketIcon className="h-5 w-5" />}
                {state === "empty" && <SunriseIcon className="h-5 w-5" />}
              </motion.div>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-[14.5px] font-extrabold tracking-tight sm:text-[15px]">{copy.headline}</h2>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--gray)] sm:text-[12.5px]">{copy.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: barColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                </div>
                <span className="flex-none text-[11px] font-bold tabular-nums text-[var(--gray)]">
                  {animatedOccupied}/{totalUnits} booked
                </span>
              </div>
            </div>

            {state === "partial" && canEdit && (
              <button
                onClick={onFillSlots}
                className={cn("btn-primary flex-none !px-3.5 !py-2 text-[12.5px]", !prefersReduced && "animate-glow-pulse")}
              >
                Fill a slot
              </button>
            )}
            {state === "empty" && (
              <div className="hidden flex-none items-center gap-1 sm:flex">
                <CalendarIcon className={cn("h-8 w-8 text-amber/60", !prefersReduced && "animate-float")} />
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
