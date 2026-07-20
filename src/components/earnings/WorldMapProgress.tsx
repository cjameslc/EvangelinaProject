"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { playCoin, playFanfare, playXpGain, playChestOpen, playPop, getSoundPrefs, subscribeSoundPrefs, setSoundEnabled, setSoundVolume } from "@/lib/sound";

type EliteTierStatus = { tier: number; amount: number; stars: number; badge: string; medal: string; slotsTotal: number; slotsTaken: number; wonByMe: boolean };
type EliteChallenge = {
  completedThisMonth: number; rank: number; totalBookers: number;
  currentTier: number | null; currentStars: number; currentBadge: string | null;
  nextTier: number | null; nextTierAmount: number | null; remaining: number; progressPct: number;
  slotsRemainingForNextTier: number; slotsTotalForNextTier: number;
  estimatedCommission: number; potentialBonus: number; tiers: EliteTierStatus[];
};

// Original fantasy-kingdom world map — an entirely custom progression path
// (CSS/SVG/emoji, no licensed art of any kind) laid over the same Elite
// Booker Challenge data the plain stat card used to show. Village and
// Forest are free waypoints along the road (no reward, just a fun sense of
// distance); the five castles/mountains/etc. after that are the real
// tiers, unchanged from before.
const WORLD_NODES = [
  { key: "village", threshold: 0, icon: "🏘️", label: "Village", from: "#7ED957", to: "#4FC3F7" },
  { key: "forest", threshold: 25, icon: "🌲", label: "Forest", from: "#3FA34D", to: "#2E7D32" },
  { key: "bronze", threshold: 50, icon: "🏰", label: "Bronze Castle", from: "#C97A3D", to: "#8D5524" },
  { key: "silver", threshold: 100, icon: "⛰️", label: "Silver Mountain", from: "#8EA9C1", to: "#5C7A99" },
  { key: "gold", threshold: 150, icon: "🌋", label: "Gold Volcano", from: "#FF7A45", to: "#B71C1C" },
  { key: "platinum", threshold: 200, icon: "☁️", label: "Platinum Sky", from: "#B3E5FC", to: "#7C9EFF" },
  { key: "legend", threshold: 250, icon: "👑", label: "Legend Kingdom", from: "#B983FF", to: "#6C5CE7" },
] as const;

function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    startRef.current = null;
    let raf: number;
    function step(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const pct = Math.min(1, elapsed / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - pct, 3)))); // ease-out cubic
      if (pct < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

export function WorldMapProgress({ challenge, employeeId }: { challenge: EliteChallenge; employeeId: string }) {
  const completed = challenge.completedThisMonth;
  const maxThreshold = WORLD_NODES[WORLD_NODES.length - 1].threshold;
  const overallPct = Math.min(100, (completed / maxThreshold) * 100);

  // Which zone the traveler is currently standing in, for the background.
  const currentZoneIndex = useMemo(() => {
    let idx = 0;
    WORLD_NODES.forEach((n, i) => { if (completed >= n.threshold) idx = i; });
    return idx;
  }, [completed]);
  const zone = WORLD_NODES[currentZoneIndex];
  const isNight = zone.key === "legend"; // Legend Kingdom reads as a starry night-sky realm

  const displayedCompleted = useCountUp(completed);
  const displayedCommission = useCountUp(challenge.estimatedCommission);

  // Coin/XP burst + sound, once per mount (i.e. once per page view) — the
  // closest thing to "every booking advances the world" achievable without
  // a live push channel: revisiting after logging bookings replays the gain.
  const [showBurst, setShowBurst] = useState(false);
  useEffect(() => {
    if (completed <= 0) return;
    const t1 = setTimeout(() => { setShowBurst(true); playCoin(); playXpGain(); }, 250);
    const t2 = setTimeout(() => setShowBurst(false), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Treasure chest celebration the first time this browser sees this
  // employee at a new zone — a simple localStorage watermark, not a
  // backend event, but it means the celebration only plays once per
  // milestone rather than every single page view.
  const [celebrating, setCelebrating] = useState<typeof WORLD_NODES[number] | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `eva-world-seen-${employeeId}`;
    const lastSeenThreshold = Number(window.localStorage.getItem(key) ?? "0");
    if (zone.threshold > lastSeenThreshold) {
      window.localStorage.setItem(key, String(zone.threshold));
      if (lastSeenThreshold > 0 || zone.threshold >= 50) {
        setCelebrating(zone);
        const t = setTimeout(() => setCelebrating(null), 2600);
        playChestOpen();
        return () => clearTimeout(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.threshold, employeeId]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white transition-colors duration-1000"
      style={{ background: `linear-gradient(160deg, ${zone.from}, ${zone.to})` }}
    >
      <SkyLayer isNight={isNight} />

      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[19px] font-extrabold drop-shadow-sm">
            {challenge.currentBadge ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block animate-float">{"⭐".repeat(challenge.currentStars)}</span> {challenge.currentBadge}
              </span>
            ) : (
              <span>{zone.icon} Traveling through {zone.label}</span>
            )}
          </div>
          <div className="mt-0.5 text-[13px] text-white/85">
            <motion.span key={displayedCompleted}>{displayedCompleted}</motion.span>
            {challenge.nextTier ? ` / ${challenge.nextTier}` : ""} bookings this month
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-white/15 px-3 py-2 text-center backdrop-blur-sm">
            <div className="text-[16px] font-extrabold">#{challenge.rank}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/80">of {challenge.totalBookers}</div>
          </div>
          <SoundControl />
        </div>
      </div>

      {/* World map road */}
      <div className="relative mt-5">
        <svg viewBox="0 0 700 40" className="absolute left-0 top-[18px] h-[3px] w-full opacity-70" preserveAspectRatio="none">
          <line x1="0" y1="20" x2="700" y2="20" stroke="white" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
        </svg>
        <div className="relative flex justify-between">
          {WORLD_NODES.map((n) => {
            const reached = completed >= n.threshold;
            return (
              <div key={n.key} className="flex flex-col items-center" style={{ width: `${100 / WORLD_NODES.length}%` }}>
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full border-2 text-[16px] shadow-md",
                    reached ? "border-white bg-white/25 backdrop-blur-sm" : "border-white/30 bg-black/10 opacity-50 grayscale"
                  )}
                >
                  {n.icon}
                </motion.div>
                <div className={cn("mt-1 text-center text-[9.5px] font-bold leading-tight", reached ? "text-white" : "text-white/60")}>{n.label}</div>
              </div>
            );
          })}
        </div>
        {/* Traveler marker */}
        <motion.div
          className="absolute -top-2 text-xl"
          initial={false}
          animate={{ left: `calc(${overallPct}% - 12px)` }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          style={{ willChange: "left" }}
        >
          <motion.span className="inline-block" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}>🏃</motion.span>
        </motion.div>
      </div>

      {/* XP bar */}
      <div className="relative mt-6 h-4 overflow-hidden rounded-full bg-white/20">
        <motion.div
          className="relative h-full rounded-full bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(4, challenge.progressPct)}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent bg-[length:200%_100%]" />
        </motion.div>
      </div>

      {challenge.nextTier ? (
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-white/90">
            <b className="text-white">{challenge.remaining} more booking{challenge.remaining === 1 ? "" : "s"}</b> to unlock 💰 {peso(challenge.nextTierAmount ?? 0)}
          </p>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-extrabold", challenge.slotsRemainingForNextTier > 0 ? "bg-white/25" : "bg-black/25")}>
            🎟️ {challenge.slotsRemainingForNextTier} of {challenge.slotsTotalForNextTier} slots left
          </span>
        </div>
      ) : (
        <p className="relative mt-3 text-[13px] font-extrabold">👑 Maximum tier reached this month — legendary!</p>
      )}

      <div className="relative mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase text-white/70">Estimated commission</div>
          <div className="text-[16px] font-extrabold">{peso(displayedCommission)}</div>
        </div>
        <div>
          <div className="text-[10.5px] font-bold uppercase text-white/70">Potential bonus</div>
          <div className="text-[16px] font-extrabold">{peso(challenge.potentialBonus)}</div>
        </div>
      </div>

      {/* Coin burst */}
      <AnimatePresence>
        {showBurst && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute text-lg"
                style={{ left: `${10 + i * 10}%`, bottom: 0 }}
                initial={{ opacity: 0, y: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0], y: -90 - (i % 3) * 20, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, delay: i * 0.05, ease: "easeOut" }}
              >
                🪙
              </motion.span>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Treasure chest celebration */}
      <AnimatePresence>
        {celebrating && (
          <motion.div
            className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.3, rotate: -8, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
              className="rounded-2xl bg-white/95 px-6 py-5 text-center text-[var(--ink)] shadow-2xl"
            >
              <div className="text-4xl">🎁</div>
              <div className="mt-1.5 text-[15px] font-extrabold">Welcome to {celebrating.label}!</div>
              <div className="text-[12px] text-[var(--gray)]">New world unlocked</div>
            </motion.div>
            {Array.from({ length: 14 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute text-lg"
                style={{ left: `${Math.random() * 100}%`, top: "40%" }}
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: [0, 1, 0], y: [0, -60 - Math.random() * 60], x: (Math.random() - 0.5) * 120 }}
                transition={{ duration: 1.4 + Math.random(), delay: 0.15 + i * 0.04, ease: "easeOut" }}
              >
                {["✨", "🎉", "🪙"][i % 3]}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Animated sky — drifting clouds by day, twinkling stars + fireflies once "Legend Kingdom" (night realm) is reached. All CSS/SVG, nothing borrowed. */
function SkyLayer({ isNight }: { isNight: boolean }) {
  const clouds = useMemo(() => Array.from({ length: 4 }).map((_, i) => ({ top: 8 + i * 14, size: 26 + (i % 3) * 10, dur: 22 + i * 6, delay: -i * 5 })), []);
  const stars = useMemo(() => Array.from({ length: 18 }).map(() => ({ x: Math.random() * 100, y: Math.random() * 55, d: 1.5 + Math.random() * 2, delay: Math.random() * 2 })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {!isNight &&
        clouds.map((c, i) => (
          <motion.div
            key={i}
            className="absolute text-white/70"
            style={{ top: `${c.top}%`, fontSize: c.size }}
            initial={{ x: "-15%" }}
            animate={{ x: "115%" }}
            transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: "linear" }}
          >
            ☁️
          </motion.div>
        ))}
      {isNight &&
        stars.map((s, i) => (
          <motion.span
            key={i}
            className="absolute text-[10px] text-white"
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: s.d, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            ✦
          </motion.span>
        ))}
    </div>
  );
}

export function EliteBadgeButton({ tier, index }: { tier: EliteTierStatus; index: number }) {
  return (
    <button
      type="button"
      onClick={() => (tier.wonByMe ? playFanfare() : playPop())}
      style={{ animationDelay: `${index * 60}ms` }}
      className={cn(
        "relative animate-pop-in rounded-xl border p-3 text-center transition-transform hover:-translate-y-0.5",
        tier.wonByMe ? "animate-glow-pulse border-rausch/40 bg-gradient-to-b from-rausch/10 to-transparent" : "border-[var(--line)] opacity-60 grayscale hover:opacity-90 hover:grayscale-0"
      )}
    >
      <div className={cn("text-lg", tier.wonByMe && "animate-float")}>{tier.medal}</div>
      <div className="mt-0.5 text-[11.5px] font-extrabold">{tier.badge}</div>
      <div className="text-[10.5px] text-[var(--gray)]">{tier.tier} bookings · {peso(tier.amount)}</div>
      <div className="mt-1 text-[10.5px] font-bold text-[var(--gray)]">{Math.max(0, tier.slotsTotal - tier.slotsTaken)} of {tier.slotsTotal} slots left</div>
      {!tier.wonByMe && <div className="absolute right-1.5 top-1.5 text-[11px] opacity-40">🔒</div>}
    </button>
  );
}

/** Mute toggle + volume slider for the synthesized sound effects — preference persists in localStorage. */
function SoundControl() {
  const [prefs, setPrefsState] = useState(getSoundPrefs());
  useEffect(() => subscribeSoundPrefs(() => setPrefsState(getSoundPrefs())), []);
  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-white/15 px-2 py-1.5 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setSoundEnabled(!prefs.enabled)}
        className="grid h-6 w-6 place-items-center text-[13px]"
        aria-label={prefs.enabled ? "Mute sound effects" : "Unmute sound effects"}
        title={prefs.enabled ? "Mute sound effects" : "Unmute sound effects"}
      >
        {prefs.enabled ? "🔊" : "🔇"}
      </button>
      {prefs.enabled && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          onChange={(e) => setSoundVolume(Number(e.target.value))}
          className="h-1 w-14 accent-white"
          aria-label="Sound effects volume"
        />
      )}
    </div>
  );
}
