"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { playCoin, playFanfare, playXpGain, playChestOpen, playPop, playQuestComplete, getSoundPrefs, subscribeSoundPrefs, setSoundEnabled, setSoundVolume } from "@/lib/sound";
import { UnsplashImage } from "@/components/guest/UnsplashImage";
import { pickStable } from "@/lib/unsplash/pick";
import type { UnsplashImage as UnsplashImageData } from "@/lib/unsplash/types";
import {
  Home, TreePine, Castle, Mountain, Flame, Cloud, Crown,
  Medal, Award, Trophy, Gem, Lock, DoorOpen, Info, Volume2, VolumeX,
  Ticket, Coins, Map as MapIcon, RefreshCw, HelpCircle, type LucideIcon,
} from "lucide-react";

type EliteTierStatus = { tier: number; amount: number; stars: number; badge: string; medal: string; slotsTotal: number; slotsTaken: number; wonByMe: boolean };
type EliteChallenge = {
  completedThisMonth: number; rank: number; totalBookers: number;
  currentTier: number | null; currentStars: number; currentBadge: string | null;
  nextTier: number | null; nextTierAmount: number | null; remaining: number; progressPct: number;
  slotsRemainingForNextTier: number; slotsTotalForNextTier: number;
  estimatedCommission: number; potentialBonus: number; tiers: EliteTierStatus[];
};

type Achievement = { id: string; label: string; unlocked: boolean; threshold?: number; rewardAmount?: number; personalMessage?: string | null };

// Original fantasy-kingdom world map — an entirely custom progression path
// (CSS/SVG/emoji, no licensed art of any kind) laid over the same Elite
// Booker Challenge data the plain stat card used to show — shared as-is by
// Housekeeping staff too (several employees do both jobs at this business).
// Cubao Village and Araneta Forest are free waypoints along the road (no
// reward, just a fun sense of distance); the five castles/mountains/etc.
// after that are the real tiers, unchanged from before — each one named
// after one of the business's own real listings, so the journey is
// recognizably *this* staycation business's world, not a generic fantasy
// skin. Evangelina's Kingdom, the finale, makes the brand itself the
// legendary destination.
const WORLD_NODES = [
  { key: "village", imageKey: "journey-village", threshold: 0, icon: Home, label: "Cubao Village", from: "#7ED957", to: "#4FC3F7" },
  { key: "forest", imageKey: "journey-forest", threshold: 25, icon: TreePine, label: "Araneta Forest", from: "#3FA34D", to: "#2E7D32" },
  { key: "bronze", imageKey: "journey-castle", threshold: 50, icon: Castle, label: "Comfort Castle", from: "#C97A3D", to: "#8D5524" },
  { key: "silver", imageKey: "journey-peak", threshold: 100, icon: Mountain, label: "Cozy Peak", from: "#8EA9C1", to: "#5C7A99" },
  { key: "gold", imageKey: "journey-volcano", threshold: 150, icon: Flame, label: "Relax Volcano", from: "#FF7A45", to: "#B71C1C" },
  { key: "platinum", imageKey: "journey-sky", threshold: 200, icon: Cloud, label: "Signature Sky", from: "#B3E5FC", to: "#7C9EFF" },
  { key: "legend", imageKey: "journey-kingdom", threshold: 250, icon: Crown, label: "Evangelina's Kingdom", from: "#B983FF", to: "#6C5CE7" },
] as const;

// Bronze → Legend tier medal icons, in tier order — replaces the old emoji
// medal strings (gamification.ts's own `medal` field is left as-is for any
// non-UI consumers; this component renders its own icon by index instead).
const TIER_ICONS: LucideIcon[] = [Medal, Award, Trophy, Gem, Crown];

// A few in-character tips/encouragements the mascot hands out from the
// Mystery Reward Box — flavor only, no mechanical effect.
const MYSTERY_MESSAGES = [
  "A warm welcome message turns a first-time guest into a repeat one. 🏡",
  "Every completed booking is a room with a five-star story waiting to happen. ⭐",
  "Cubao Village remembers every host who keeps their word on check-in time. 🕒",
  "The road to Evangelina's Kingdom is paved one happy guest at a time. 👑",
  "Quick replies win bookings — the fastest host in the village gets the gold. ⚡",
  "A tidy handover is worth more than any coin chest. 🧹✨",
];

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

export function WorldMapProgress({ challenge, employeeId, journeyImages }: { challenge: EliteChallenge; employeeId: string; journeyImages?: Record<string, UnsplashImageData[]> }) {
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
  const zoneImage = pickStable(journeyImages?.[zone.imageKey] ?? [], zone.key);
  const ZoneIcon = zone.icon;

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
      className="relative overflow-hidden rounded-2xl p-5 text-white transition-colors duration-1000 [text-shadow:0_1px_5px_rgba(0,0,0,0.55)]"
      style={{ background: `linear-gradient(160deg, ${zone.from}, ${zone.to})` }}
    >
      {zoneImage && (
        <div className="pointer-events-none absolute inset-0 opacity-35 mix-blend-overlay transition-opacity duration-1000">
          <UnsplashImage image={zoneImage} alt={zone.label} className="h-full w-full" showAttribution={false} />
        </div>
      )}
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
              <span className="inline-flex items-center gap-1.5"><ZoneIcon className="h-[18px] w-[18px]" /> Traveling through {zone.label}</span>
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
          <HowItWorksButton challenge={challenge} />
        </div>
      </div>

      {/* World map road */}
      <div className="relative mt-5">
        <svg viewBox="0 0 700 40" className="absolute left-0 top-[18px] h-[3px] w-full opacity-70" preserveAspectRatio="none">
          <line x1="0" y1="20" x2="700" y2="20" stroke="white" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
        </svg>
        {/* Welcome-door check-in points between each world — this business's
            own spin on a "warp gate," since every world here is a stay. */}
        <div className="absolute left-0 top-[13px] flex w-full justify-between px-[calc(50%/7)]">
          {WORLD_NODES.slice(0, -1).map((n, i) => (
            <span key={n.key} className={cn("opacity-0 sm:opacity-100", completed >= WORLD_NODES[i + 1].threshold ? "grayscale-0" : "grayscale opacity-40")}>
              <DoorOpen className="h-[13px] w-[13px]" />
            </span>
          ))}
        </div>
        <div className="relative flex justify-between">
          {WORLD_NODES.map((n) => {
            const reached = completed >= n.threshold;
            const NodeIcon = n.icon;
            return (
              <div key={n.key} className="flex flex-col items-center" style={{ width: `${100 / WORLD_NODES.length}%` }}>
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full border-2 shadow-md",
                    reached ? "border-white bg-white/25 backdrop-blur-sm" : "border-white/30 bg-black/10 opacity-50 grayscale"
                  )}
                >
                  <NodeIcon className="h-[17px] w-[17px]" />
                </motion.div>
                <div className={cn("mt-1 text-center text-[9.5px] font-bold leading-tight", reached ? "text-white" : "text-white/60")}>{n.label}</div>
              </div>
            );
          })}
        </div>
        {/* Traveler marker — an original mascot, not a licensed character */}
        <motion.div
          className="absolute -top-3 z-10"
          initial={false}
          animate={{ left: `calc(${overallPct}% - 14px)` }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          style={{ willChange: "left" }}
        >
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}>
            <StaySprite />
          </motion.div>
        </motion.div>
        <MysteryBox pct={overallPct} />
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
          <p className="inline-flex items-center gap-1 text-[13px] font-semibold text-white/90">
            <b className="text-white">{challenge.remaining} more booking{challenge.remaining === 1 ? "" : "s"}</b> to unlock <Coins className="h-[13px] w-[13px]" /> {peso(challenge.nextTierAmount ?? 0)}
          </p>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold", challenge.slotsRemainingForNextTier > 0 ? "bg-white/25" : "bg-black/25")}>
            <Ticket className="h-[12px] w-[12px]" /> {challenge.slotsRemainingForNextTier} of {challenge.slotsTotalForNextTier} slots left
          </span>
        </div>
      ) : (
        <p className="relative mt-3 inline-flex items-center gap-1.5 text-[13px] font-extrabold">
          <Crown className="h-[15px] w-[15px]" /> You&apos;ve reached Evangelina&apos;s Kingdom this month — legendary!
        </p>
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
              className="rounded-2xl bg-white px-6 py-5 text-center text-gray-900 shadow-2xl"
            >
              <div className="text-4xl">🎁</div>
              <div className="mt-1.5 text-[15px] font-extrabold text-gray-900">Welcome to {celebrating.label}!</div>
              <div className="text-[12px] text-gray-500">New world unlocked</div>
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
  const TierIcon = TIER_ICONS[index] ?? Medal;
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
      <TierIcon className={cn("mx-auto h-5 w-5 text-rausch", tier.wonByMe && "animate-float")} />
      <div className="mt-0.5 text-[11.5px] font-extrabold">{tier.badge}</div>
      <div className="text-[10.5px] text-[var(--gray)]">{tier.tier} bookings · {peso(tier.amount)}</div>
      <div className="mt-1 text-[10.5px] font-bold text-[var(--gray)]">{Math.max(0, tier.slotsTotal - tier.slotsTaken)} of {tier.slotsTotal} slots left</div>
      {!tier.wonByMe && <Lock className="absolute right-1.5 top-1.5 h-3 w-3 opacity-40" />}
    </button>
  );
}

/**
 * "Via" — an entirely original bellhop mascot built from plain SVG shapes:
 * round head, pillbox bellhop cap, a vest in the brand's own rausch red
 * with gold buttons, holding a little brass key. No resemblance to any
 * licensed character is intended — different silhouette, different colors,
 * different props, drawn from scratch for this app.
 */
function StaySprite() {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" aria-hidden>
      <ellipse cx="14" cy="32" rx="9" ry="2" fill="black" opacity="0.15" />
      <rect x="8.5" y="23" width="3.5" height="7" rx="1.5" fill="#3D2B1F" />
      <rect x="16" y="23" width="3.5" height="7" rx="1.5" fill="#3D2B1F" />
      <rect x="6" y="13" width="16" height="12" rx="5" fill="#FF385C" />
      <circle cx="14" cy="17" r="1.1" fill="#FFD54F" />
      <circle cx="14" cy="21" r="1.1" fill="#FFD54F" />
      <rect x="1.5" y="14" width="5.5" height="4.2" rx="2.1" fill="#FF385C" />
      <rect x="21" y="14" width="5.5" height="4.2" rx="2.1" fill="#FF385C" />
      <circle cx="25.5" cy="18" r="2.3" fill="#FFD54F" stroke="#B7891F" strokeWidth="0.6" />
      <circle cx="14" cy="8" r="6.6" fill="#FFD9B3" />
      <path d="M7.6 8a6.4 6.4 0 0 1 12.8 0z" fill="#B7123A" />
      <rect x="7.6" y="6.6" width="12.8" height="2" rx="1" fill="#8E0E2E" />
      <circle cx="14" cy="4.4" r="1.1" fill="#FFD54F" />
    </svg>
  );
}

/** A small clickable "?" waypoint marker in the brand's own gold/rausch —
 * taps hand out an in-character hospitality tip, purely for flavor. */
function MysteryBox({ pct }: { pct: number }) {
  const [open, setOpen] = useState<string | null>(null);
  function tap() {
    playCoin();
    setOpen(MYSTERY_MESSAGES[Math.floor(Math.random() * MYSTERY_MESSAGES.length)]);
    setTimeout(() => setOpen(null), 3200);
  }
  return (
    <div className="absolute top-[46px]" style={{ left: `calc(${Math.min(92, pct + 6)}% - 11px)` }}>
      <motion.button
        type="button"
        onClick={tap}
        whileTap={{ scale: 0.85, rotate: -8 }}
        animate={{ y: [0, -3, 0] }}
        transition={{ y: { repeat: Infinity, duration: 1.6, ease: "easeInOut" } }}
        className="grid h-[22px] w-[22px] place-items-center rounded-md border border-amber/60 bg-amber text-[11px] font-extrabold text-white shadow"
        aria-label="Mystery reward"
        title="?"
      >
        ?
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            className="absolute left-1/2 top-[28px] z-20 w-[190px] -translate-x-1/2 rounded-xl bg-white p-2.5 text-center text-[11px] font-semibold text-gray-900 shadow-xl"
          >
            {open}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Info button opening a plain-language explainer of how the world map, tiers, and achievements actually work. */
function HowItWorksButton({ challenge }: { challenge: EliteChallenge }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 backdrop-blur-sm hover:bg-white/25"
        aria-label="How this works"
        title="How this works"
      >
        <Info className="h-[17px] w-[17px]" />
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="How the Elite Booker Challenge works" maxWidth={480} footer={<button onClick={() => setOpen(false)} className="btn-primary ml-auto">Got it</button>}>
          <div className="space-y-4 text-[13px] text-[var(--gray)]">
            <section>
              <h3 className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--ink)]"><MapIcon className="h-[15px] w-[15px]" /> The world map</h3>
              <p>Your position on the road tracks <b className="text-[var(--ink)]">completed bookings this month</b> — a booking counts once the stay is actually finished, not the moment it&rsquo;s logged. Every completed booking moves you further along, through Cubao Village → Araneta Forest → Comfort Castle → Cozy Peak → Relax Volcano → Signature Sky → Evangelina&rsquo;s Kingdom.</p>
            </section>
            <section>
              <h3 className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--ink)]"><Trophy className="h-[15px] w-[15px]" /> Reward tiers</h3>
              <p className="mb-1.5">Five of the seven worlds carry a real ₱ reward, with <b className="text-[var(--ink)]">limited slots</b> — first come, first served each month:</p>
              <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                {challenge.tiers.map((t, i) => {
                  const TIcon = TIER_ICONS[i] ?? Medal;
                  return (
                    <div key={t.tier} className="flex items-center justify-between border-t border-[var(--line)] px-3 py-1.5 text-[12px] first:border-0">
                      <span className="inline-flex items-center gap-1.5"><TIcon className="h-3.5 w-3.5" /> {t.badge} · {t.tier} bookings</span>
                      <span className="font-bold text-[var(--ink)]">{peso(t.amount)} · {t.slotsTotal} slot{t.slotsTotal === 1 ? "" : "s"}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5">Whoever reaches a tier&rsquo;s booking count first claims a slot — once a tier&rsquo;s slots are full, later bookers can still reach that world, just without the ₱ reward attached.</p>
            </section>
            <section>
              <h3 className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--ink)]"><Award className="h-[15px] w-[15px]" /> Achievements</h3>
              <p>Separate from the monthly challenge — these are set per person by the owner, based on your <b className="text-[var(--ink)]">lifetime</b> completed bookings/cleanings, not this month&rsquo;s. Once unlocked, a badge (and its ₱ reward, if it has one) is yours for good — it never resets.</p>
            </section>
            <section>
              <h3 className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--ink)]"><RefreshCw className="h-[15px] w-[15px]" /> Monthly reset</h3>
              <p>The world map and tier rewards reset on the 1st of every month. Rank, slots, and position all start over — but every badge you&rsquo;ve already earned stays earned.</p>
            </section>
            <section>
              <h3 className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--ink)]"><HelpCircle className="h-[15px] w-[15px]" /> Mystery Box &amp; sound</h3>
              <p>The gold “?” along the road just hands out a quick tip for fun — it doesn&rsquo;t change your rewards. The sound button next to it mutes or adjusts the little sound effects; your choice is remembered next time you visit.</p>
            </section>
          </div>
        </Modal>
      )}
    </>
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
        className="grid h-6 w-6 place-items-center"
        aria-label={prefs.enabled ? "Mute sound effects" : "Unmute sound effects"}
        title={prefs.enabled ? "Mute sound effects" : "Unmute sound effects"}
      >
        {prefs.enabled ? <Volume2 className="h-[15px] w-[15px]" /> : <VolumeX className="h-[15px] w-[15px]" />}
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

// Same playful treatment for the Achievements grid — pop-in on mount
// (staggered per card), a shimmer sweep across unlocked badges, locked ones
// grayscale until earned. Click plays a chime (fanfare if unlocked, a soft
// pop otherwise). Shared by both My Earnings and the Housekeeping page.
export function AchievementBadgeCard({ a, index }: { a: Achievement; index: number }) {
  const [sparkling, setSparkling] = useState(false);

  function onTap() {
    if (a.unlocked) {
      playQuestComplete();
      setSparkling(true);
      setTimeout(() => setSparkling(false), 900);
    } else {
      playPop();
    }
  }

  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={{ scale: 0.94 }}
      style={{ animationDelay: `${index * 70}ms` }}
      className={cn(
        "relative animate-pop-in overflow-hidden rounded-2xl border p-4 text-center transition-transform hover:-translate-y-0.5",
        a.unlocked ? "border-rausch/30 bg-gradient-to-b from-rausch/10 via-amber/5 to-transparent" : "border-[var(--line)] opacity-50 grayscale hover:opacity-80 hover:grayscale-0"
      )}
    >
      {a.unlocked && <div className="pointer-events-none absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent bg-[length:200%_100%]" />}
      <div className={cn("relative flex justify-center", a.unlocked && "animate-float")}>
        {a.unlocked ? <Trophy className="h-6 w-6 text-rausch" /> : <Lock className="h-6 w-6 text-[var(--gray)]" />}
      </div>
      <div className="relative mt-1.5 text-[12.5px] font-bold">{a.label}</div>
      {a.unlocked && !!a.rewardAmount && (
        <div className="relative mt-0.5 inline-flex items-center gap-1 text-[12px] font-bold text-green">
          <Coins className="h-3.5 w-3.5" /> {peso(a.rewardAmount)}
        </div>
      )}
      {a.unlocked && a.personalMessage && <div className="relative mt-1 text-[11px] italic text-[var(--gray)]">&ldquo;{a.personalMessage}&rdquo;</div>}
      <AnimatePresence>
        {sparkling && (
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute text-sm"
                style={{ left: `${20 + i * 12}%`, top: "50%" }}
                initial={{ opacity: 0, scale: 0.4, y: 0 }}
                animate={{ opacity: [0, 1, 0], scale: 1, y: -30 - (i % 3) * 10, x: (i - 3) * 8 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, delay: i * 0.04, ease: "easeOut" }}
              >
                ✨
              </motion.span>
            ))}
          </div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
