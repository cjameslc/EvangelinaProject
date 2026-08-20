"use client";

import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { renderMoney } from "@/lib/campaignEngine/mask";
import type { CampaignDashboardData } from "@/lib/campaignEngine/types";
import { TrophyIcon } from "@/components/ui/Icons";

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

export function CampaignBookerCards({ data, viewerEmployeeId }: { data: CampaignDashboardData; viewerEmployeeId: string | null }) {
  return (
    <>
      {/* 10. Reward showcase */}
      <section className="mt-10">
        <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Rewards</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl p-6 text-center text-white shadow-[0_16px_40px_rgba(232,164,0,.35)]" style={{ background: "linear-gradient(135deg, #FFD770 0%, #E8A400 60%, #B97A00 100%)" }}>
            <div className={cn("mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/25 backdrop-blur", data.targetAchieved && "animate-glow-pulse")}>
              <TrophyIcon className="h-7 w-7" />
            </div>
            <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-white/85">🥇 Champion</div>
            <div className="mt-1 text-[38px] font-extrabold leading-none">{peso(data.winnerRewardPesos)}</div>
            <div className="mt-1.5 text-[12.5px] font-semibold text-white/85">Highest Profit Generated</div>
            {data.winner && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-extrabold backdrop-blur">
                {data.winnerFinalized ? "Winner:" : "Current leader:"} {data.winner.name}
              </div>
            )}
          </div>
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6 text-center shadow-s">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-2)] text-[24px]">🎖</div>
            <div className="mt-3 text-[12px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Participant</div>
            <div className="mt-1 text-[32px] font-extrabold leading-none text-[var(--ink)]">{peso(data.participantRewardPesos)}</div>
            <div className="mt-1.5 text-[12.5px] font-semibold text-[var(--gray)]">All other participating bookers</div>
          </div>
        </div>
        {!data.targetAchieved && !data.winnerFinalized && (
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-2.5 text-center text-[12.5px] font-bold text-[var(--gray)]">
            🏃 Rewards finalize once the ₱{data.targetPesos.toLocaleString("en-PH")} target is reached.
          </div>
        )}
      </section>

      {/* 9. Booker cards */}
      <section className="mt-10">
        <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Every Booker</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.ranked.map((p) => {
            const isViewer = p.employeeId === viewerEmployeeId;
            const reward = data.targetAchieved ? (p.rank === 1 ? data.winnerRewardPesos : data.participantRewardPesos) : null;
            return (
              <div
                key={p.employeeId}
                className={cn(
                  "card p-4 transition-shadow duration-200 hover:shadow-card",
                  isViewer && "ring-2 ring-[var(--skin-primary,#6C5CE7)]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--gray)]">Group {p.side}</span>
                  <span className="text-[13px] font-extrabold">{p.rank <= 3 ? RANK_MEDAL[p.rank - 1] : `#${p.rank}`}</span>
                </div>
                <div className="mt-2 truncate text-[15px] font-extrabold">{p.name}{isViewer && <span className="ml-1.5 text-[11px] font-bold text-[var(--skin-primary,#6C5CE7)]">(you)</span>}</div>
                <div className="text-[22px] font-extrabold tabular-nums text-[var(--ink)]">{renderMoney(p.profitPesos)}</div>
                <div className="text-[11px] font-bold text-[var(--gray)]">Profit Generated</div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
                  <div><span className="text-[var(--gray)]">Bookings </span><span className="font-extrabold">{p.bookingCount}</span></div>
                  <div><span className="text-[var(--gray)]">Revenue </span><span className="font-extrabold">{renderMoney(p.revenuePesos)}</span></div>
                </div>
                <div className="mt-3 rounded-xl bg-gradient-to-r from-[#FFF6E0] to-[#FFE8B0] px-3 py-2 text-center dark:from-[#2a2210] dark:to-[#3a2c10]">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#8a5a00]">Reward</div>
                  <div className="text-[16px] font-extrabold text-[#8a5a00]">{reward != null ? peso(reward) : "TBD"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
