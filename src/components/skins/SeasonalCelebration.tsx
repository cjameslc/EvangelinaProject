"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Confetti } from "@/components/guest/Confetti";
import { useSeasonalSkin } from "./SeasonalSkinProvider";

export type SeasonalCelebrationHandle = { fire: () => void };

/**
 * Renders nothing until fired. Mount once per screen that needs a
 * celebration (booking success, feedback success, ...) and drive it via
 * useCelebrate() below — this is the one place any skin's confetti
 * actually renders, reusing the existing Confetti component (brief
 * section 23/26: "do not create separate confetti implementations for
 * every skin"). `key` forces a fresh mount on every fire so a rapid
 * double-fire restarts the burst instead of no-op'ing into an
 * already-finished one.
 */
export const SeasonalCelebration = forwardRef<SeasonalCelebrationHandle, { count?: number }>(function SeasonalCelebration({ count }, ref) {
  const skin = useSeasonalSkin();
  const [fireKey, setFireKey] = useState(0);
  const [active, setActive] = useState(false);

  useImperativeHandle(ref, () => ({
    fire: () => {
      setFireKey((k) => k + 1);
      setActive(true);
    },
  }));

  if (!active) return null;
  return <Confetti key={fireKey} count={count} colors={skin.confettiColors} />;
});

/**
 * celebrate({ type }) — a reusable, skin-aware celebration trigger (brief
 * section 24). `type` is accepted for call-site clarity and future
 * per-event-type tuning (e.g. a bigger burst for a milestone vs a routine
 * success), but which *colors* fire is always determined by the active
 * skin alone, never by type — matching the brief's own diagram (Booking
 * success -> celebrate() -> active skin decides the effect). Render the
 * returned `celebrationRef` into <SeasonalCelebration ref={celebrationRef} />
 * somewhere in the same screen, then call `celebrate()` from a success
 * handler.
 */
export function useCelebrate() {
  const celebrationRef = useRef<SeasonalCelebrationHandle>(null);
  const celebrate = useCallback((_options?: { type?: "booking-success" | "feedback-success" | "milestone" | string }) => {
    celebrationRef.current?.fire();
  }, []);
  return { celebrationRef, celebrate };
}
