"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CampaignDashboardData } from "@/lib/campaignEngine/types";
import { CampaignLeaderboard } from "./CampaignLeaderboard";
import { CampaignBookerCards } from "./CampaignBookerCards";
import { CampaignCharts } from "./CampaignCharts";
import { CampaignAchievements } from "./CampaignAchievements";
import { CampaignCelebration } from "./CampaignCelebration";
import { CampaignConfigPanel } from "./CampaignConfigPanel";
import { SettingsIcon } from "@/components/ui/Icons";

const FLOAT_EMOJIS = ["✨", "🏆", "💰", "⭐"];

function FloatingLayer({ count = 10 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const emoji = FLOAT_EMOJIS[i % FLOAT_EMOJIS.length];
        const left = (i * 37.3) % 100;
        const top = i % 2 === 0 ? 8 + ((i * 13) % 24) : 62 + ((i * 17) % 28);
        const size = 14 + (i % 3) * 6;
        const duration = 6 + (i % 5);
        const delay = (i % 6) * 0.6;
        const driftX = ((i % 5) - 2) * 12;
        const driftY = -14 - (i % 4) * 8;
        const rotate = (i % 2 === 0 ? 1 : -1) * (5 + (i % 3) * 5);
        const style: CSSProperties & Record<string, string | number> = {
          left: `${left}%`, top: `${top}%`, fontSize: size,
          animationDuration: `${duration}s`, animationDelay: `${delay}s`,
          "--sd-drift-x": `${driftX}px`, "--sd-drift-y": `${driftY}px`, "--sd-rotate": `${rotate}deg`, "--sd-opacity": 0.55,
        };
        return <span key={i} className="absolute select-none opacity-0 animate-seasonal-drift" style={style}>{emoji}</span>;
      })}
    </div>
  );
}

/** SVG ring — deliberately not a CSS conic-gradient, so the fill animates via stroke-dashoffset transition without needing @property registration. Updates automatically whenever pct changes (a fresh fetch), never re-plays from 0. */
function ProgressRing({ pct, size = 200, children }: { pct: number; size?: number; children?: React.ReactNode }) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-gradient)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms var(--ease-out)" }}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD770" />
            <stop offset="100%" stopColor="#FF385C" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Counts up from its previous value to the next on every change — one shared micro-interaction for every big number on the page (target ring %, ₱ generated, ₱ remaining). Skips the animation under prefers-reduced-motion (jumps straight to the final value). */
function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(target);
  const prefersReduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useEffect(() => {
    if (prefersReduced) { setValue(target); return; }
    let raf: number;
    const start = performance.now();
    const from = value;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

export function GamificationView({ role, ownEmployeeId }: { role: string; ownEmployeeId: string | null }) {
  const [data, setData] = useState<CampaignDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const isAdmin = role === "OWNER_ADMIN";

  async function load() {
    const res = await fetch("/api/gamification/campaign");
    const j = await res.json().catch(() => ({}));
    setData(j.campaign ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const animatedPct = useCountUp(data?.progressPct ?? 0);
  const animatedTotal = useCountUp(data?.totalProfitPesos ?? 0);

  if (loading) {
    return <div className="grid h-[50vh] place-items-center text-[14px] text-[var(--gray)]">Loading championship…</div>;
  }
  if (!data) {
    return (
      <div className="card p-8 text-center">
        <div className="text-[15px] font-extrabold">No active campaign yet</div>
        <p className="mt-1.5 text-[13px] text-[var(--gray)]">An Owner/Admin can set one up from this page once a campaign for this month starts.</p>
      </div>
    );
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(new Date(data.periodStart));

  return (
    <div className="mx-auto max-w-[1080px] pb-16">
      {/* 1. Hero */}
      <div
        className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_24px_60px_rgba(30,10,60,.35)] sm:p-10"
        style={{ background: "linear-gradient(135deg, #1e0a3c 0%, #4a1a6e 45%, #7a1f4d 100%)" }}
      >
        {data.heroImageUrl && (
          <div
            className="absolute inset-0 animate-ken-burns bg-cover bg-center"
            style={{ backgroundImage: `url(${data.heroImageUrl})` }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(30,10,60,.88), rgba(90,20,60,.72))" }} aria-hidden />
        <FloatingLayer />
        {isAdmin && (
          <button
            onClick={() => setConfigOpen(true)}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition duration-150 [transition-timing-function:var(--ease-out)] hover:bg-white/25 active:scale-90"
            aria-label="Configure campaign"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        )}
        <div className="relative z-[1] flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[12px] font-extrabold uppercase tracking-[0.18em] text-white/70">{monthLabel.toUpperCase()}</div>
            <h1 className="mt-1 text-[32px] font-extrabold leading-[1.05] tracking-tight sm:text-[44px]">Sales Championship</h1>
            <p className="mt-2 max-w-md text-[14.5px] font-semibold text-white/85 sm:text-[16px]">
              Reach {peso(data.targetPesos)} and compete for {peso(data.winnerRewardPesos)}
            </p>
            {!data.winnerFinalized && (
              <div className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold", data.targetAchieved ? "bg-[#FFD770] text-[#4a2c00]" : "bg-white/15 text-white backdrop-blur-md")}>
                {data.targetAchieved ? "🏆 Target Achieved — Race for #1 continues" : "🏃 Competition Still Open"}
              </div>
            )}
            {data.winnerFinalized && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FFD770] px-3.5 py-1.5 text-[12.5px] font-extrabold text-[#4a2c00]">
                🏁 Campaign Closed — Final results below
              </div>
            )}
          </div>
          <div className="flex flex-none flex-col items-center rounded-3xl bg-white/10 p-5 text-center backdrop-blur-md">
            <ProgressRing pct={animatedPct}>
              <div className="text-[36px] font-extrabold tabular-nums">{animatedPct}%</div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-white/70">Progress</div>
            </ProgressRing>
            <div className="mt-2 text-[13.5px] font-bold tabular-nums">{peso(animatedTotal)} generated</div>
            <div className="text-[12px] font-semibold text-white/75">{peso(data.remainingPesos)} to go</div>
          </div>
        </div>
      </div>

      {/* Motivation strip */}
      {data.viewer.motivation && (
        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-center text-[13.5px] font-bold shadow-s animate-fade-up">
          {data.viewer.motivation}
        </div>
      )}

      {/* 5. Milestone journey */}
      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Milestone Journey</h2>
        <div className="card overflow-x-auto p-4 sm:p-5">
          <div className="flex min-w-[560px] items-center gap-1">
            {data.milestones.map((m, i) => (
              <div key={m.fraction} className="flex flex-1 items-center gap-1">
                <div className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "grid h-11 w-11 flex-none place-items-center rounded-full text-[17px] transition duration-300 [transition-timing-function:var(--ease-out)]",
                      m.unlocked ? "animate-glow-pulse bg-gradient-to-br from-[#FFD770] to-[#FF385C] text-white shadow-[0_6px_18px_rgba(255,56,92,.35)]" : "bg-[var(--bg-2)] text-[var(--gray)]"
                    )}
                  >
                    {m.unlocked ? m.emoji : "🔒"}
                  </div>
                  <div className="text-center text-[11px] font-extrabold leading-tight">{m.label}</div>
                  <div className="text-[10.5px] font-bold text-[var(--gray)]">{peso(m.pesos)}</div>
                </div>
                {i < data.milestones.length - 1 && (
                  <div className={cn("h-[3px] flex-1 rounded-full transition-colors duration-300", data.milestones[i + 1].unlocked || m.unlocked ? "bg-gradient-to-r from-[#FF385C] to-[#FFD770]" : "bg-[var(--line)]")} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <CampaignLeaderboard data={data} />
      <CampaignBookerCards data={data} viewerEmployeeId={ownEmployeeId} />
      <CampaignCharts data={data} />
      <CampaignAchievements achievements={data.achievements} />

      <CampaignCelebration data={data} onClosed={load} />
      {isAdmin && (
        <CampaignConfigPanel
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          campaign={data}
          onSaved={() => { setConfigOpen(false); load(); }}
        />
      )}
    </div>
  );
}
