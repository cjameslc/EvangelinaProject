"use client";

import { useEffect, useState } from "react";
import { peso } from "@/lib/format";
import { Confetti } from "@/components/guest/Confetti";
import type { CampaignDashboardData } from "@/lib/campaignEngine/types";

function storageKey(campaignId: string) {
  return `gamification-celebrated:${campaignId}`;
}

/**
 * Fires once per browser per campaign, the first time this component sees
 * targetAchievedAt set — never replayed on a later reload (localStorage
 * flag), and never fires again once already shown even if the user keeps
 * refreshing while the campaign stays ACTIVE. A different browser/device
 * still gets its own first-time reveal, which is the right behavior (this
 * is a per-viewer celebration moment, not a global one-time event log).
 */
export function CampaignCelebration({ data, onClosed }: { data: CampaignDashboardData; onClosed: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data.targetAchievedAt) return;
    const key = storageKey(data.campaignId);
    if (typeof window === "undefined" || window.localStorage.getItem(key)) return;
    setOpen(true);
    window.localStorage.setItem(key, "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.targetAchievedAt, data.campaignId]);

  if (!open) return null;

  const winner = data.winner;
  const others = data.ranked.filter((r) => r.employeeId !== winner?.employeeId);

  function close() {
    setOpen(false);
    onClosed();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <Confetti />
      <div className="relative w-full max-w-[480px] animate-pop-in overflow-hidden rounded-[28px] p-7 text-center text-white shadow-[0_30px_80px_rgba(0,0,0,.5)]" style={{ background: "linear-gradient(160deg, #1e0a3c 0%, #4a1a6e 45%, #7a1f4d 100%)" }}>
        <button onClick={close} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/15 transition duration-150 hover:bg-white/25 active:scale-90">✕</button>
        <div className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-white/70">🎉 Target Achieved!</div>
        <div className="mt-1 text-[38px] font-extrabold leading-none">{peso(data.targetPesos)}</div>
        <div className="mt-1 text-[13px] font-semibold text-white/80">{data.name} Goal Completed</div>

        {winner && (
          <div className="mt-6 flex flex-col items-center">
            <div className="grid h-20 w-20 animate-glow-pulse place-items-center rounded-full bg-gradient-to-br from-[#FFD770] to-[#E8A400] text-[34px] shadow-[0_10px_30px_rgba(255,215,112,.5)]">🏆</div>
            <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-white/70">{data.name.replace(/\s*Sales Championship\s*$/i, "")} Champion</div>
            <div className="mt-1 text-[24px] font-extrabold">{winner.name}</div>
            <div className="mt-1 text-[14px] font-bold text-white/85">{peso(winner.profitPesos)} Profit Generated</div>
            <div className="mt-4 rounded-2xl bg-white/12 px-5 py-3 backdrop-blur-md">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-white/70">💰 Reward</div>
              <div className="text-[26px] font-extrabold">{peso(data.winnerRewardPesos)}</div>
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div className="mt-6 border-t border-white/15 pt-4 text-left">
            <div className="mb-2 text-center text-[11px] font-extrabold uppercase tracking-wide text-white/70">Other participating bookers</div>
            <div className="space-y-1.5">
              {others.map((o) => (
                <div key={o.employeeId} className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-[12.5px] font-bold">
                  <span>{o.name}</span>
                  <span className="text-white/85">{peso(data.participantRewardPesos)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={close} className="mt-6 w-full rounded-2xl bg-white py-3 text-[14px] font-extrabold text-[#4a1a6e] transition duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]">
          Continue to Dashboard
        </button>
      </div>
    </div>
  );
}
