"use client";

import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CampaignDashboardData, RankedParticipant } from "@/lib/campaignEngine/types";

const RANK_MEDAL = ["🥇", "🥈", "🥉"];
const SIDE_COLOR: Record<string, { text: string; bg: string; ring: string }> = {
  A: { text: "text-violet", bg: "bg-violet/10", ring: "ring-violet/30" },
  B: { text: "text-blue", bg: "bg-blue/10", ring: "ring-blue/30" },
};

function Avatar({ p, size = 56 }: { p: RankedParticipant; size?: number }) {
  const initials = p.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return p.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatarUrl is a stored data-URL, not an optimizable remote asset (same pattern as every other avatar in this app)
    <img src={p.avatarUrl} alt={p.name} width={size} height={size} className="flex-none rounded-full object-cover ring-2 ring-white/60" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <div
      className="grid flex-none place-items-center rounded-full font-extrabold text-white ring-2 ring-white/60"
      style={{ width: size, height: size, background: p.avatarColor, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

function TrendBadge({ trendPct }: { trendPct: number | null }) {
  if (trendPct === null) return null;
  const up = trendPct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold", up ? "bg-teal/15 text-teal" : "bg-rausch/15 text-rausch")}>
      {up ? "↑" : "↓"} {Math.abs(trendPct)}%
    </span>
  );
}

function PodiumSlot({ p, place }: { p: RankedParticipant; place: 1 | 2 | 3 }) {
  const heights = { 1: "h-[168px] sm:h-[196px]", 2: "h-[128px] sm:h-[150px]", 3: "h-[104px] sm:h-[122px]" };
  const avatarSize = place === 1 ? 72 : 56;
  return (
    <div className={cn("flex flex-col items-center", place === 1 ? "order-2" : place === 2 ? "order-1" : "order-3")}>
      <div className="flex flex-col items-center gap-1.5">
        <div className="text-[22px]">{RANK_MEDAL[place - 1]}</div>
        <Avatar p={p} size={avatarSize} />
        <div className="max-w-[110px] truncate text-center text-[13px] font-extrabold">{p.name}</div>
        {p.role === "HOUSEKEEPING" && <div className="text-[10px] font-bold text-[var(--gray)]">Housekeeping</div>}
        <div className="text-center text-[15px] font-extrabold tabular-nums text-[var(--ink)]">{peso(p.profitPesos)}</div>
        <TrendBadge trendPct={p.trendPct} />
      </div>
      <div
        className={cn(
          "mt-3 flex w-[92px] flex-none animate-pop-in flex-col items-center justify-start rounded-t-2xl pt-2 text-white shadow-[0_10px_24px_rgba(0,0,0,.18)] sm:w-[120px]",
          heights[place],
          place === 1 ? "bg-gradient-to-b from-[#FFD770] to-[#E8A400]" : place === 2 ? "bg-gradient-to-b from-[#C9D2DE] to-[#8E99AA]" : "bg-gradient-to-b from-[#E3AE7C] to-[#B97A45]"
        )}
        style={{ animationDelay: `${(3 - place) * 90}ms` }}
      >
        <div className="text-[20px] font-extrabold">#{place}</div>
      </div>
    </div>
  );
}

export function CampaignLeaderboard({ data }: { data: CampaignDashboardData }) {
  const { podium, ranked, teamBattle } = data;

  return (
    <>
      {/* 6. Podium */}
      {podium.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Live Leaderboard</h2>
          <div className="card flex items-end justify-center gap-3 overflow-x-auto p-6 sm:gap-6">
            {podium.map((p) => <PodiumSlot key={p.employeeId} p={p} place={p.rank as 1 | 2 | 3} />)}
          </div>
        </section>
      )}

      {/* 7. Full leaderboard */}
      <section className="mt-6">
        <div className="card overflow-hidden">
          <div className="divide-y divide-[var(--line)]">
            {ranked.map((p) => {
              const maxProfit = ranked[0]?.profitPesos || 1;
              const barPct = Math.min(100, Math.round((p.profitPesos / maxProfit) * 100));
              const side = SIDE_COLOR[p.side];
              return (
                <div key={p.employeeId} className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-[var(--bg-2)] sm:px-5">
                  <div className="w-7 flex-none text-center text-[14px] font-extrabold text-[var(--gray)]">{p.rank <= 3 ? RANK_MEDAL[p.rank - 1] : `#${p.rank}`}</div>
                  <Avatar p={p} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-extrabold">{p.name}</span>
                      {side && <span className={cn("flex-none rounded-full px-1.5 py-0.5 text-[10px] font-extrabold", side.bg, side.text)}>Group {p.side}</span>}
                      <TrendBadge trendPct={p.trendPct} />
                    </div>
                    <div className="mt-1 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-[var(--bg-2)]">
                      <div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-rausch to-gold transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `scaleX(${barPct / 100})` }} />
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-[var(--gray)]">{p.bookingCount} booking{p.bookingCount === 1 ? "" : "s"} · {peso(p.revenuePesos)} revenue</div>
                  </div>
                  <div className="flex-none text-right">
                    <div className="text-[15px] font-extrabold tabular-nums">{peso(p.profitPesos)}</div>
                    <div className="text-[10.5px] font-bold text-[var(--gray)]">
                      {data.targetAchieved
                        ? `${data.winnerFinalized ? "" : "currently: "}${peso(p.rank === 1 ? data.winnerRewardPesos : data.participantRewardPesos)}`
                        : p.rank === 1 ? `if wins: ${peso(data.winnerRewardPesos)}` : `if joins: ${peso(data.participantRewardPesos)}`}
                    </div>
                  </div>
                </div>
              );
            })}
            {ranked.length === 0 && (
              <div className="p-8 text-center text-[13px] text-[var(--gray)]">No participants configured for this campaign yet.</div>
            )}
          </div>
        </div>
      </section>

      {/* 8. Team battle */}
      {teamBattle && (
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Team Battle</h2>
          <div className="card p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-4 sm:gap-8">
              {(["A", "B"] as const).map((side) => {
                const t = teamBattle[side];
                const leading = teamBattle.leadingSide === side;
                const c = SIDE_COLOR[side];
                return (
                  <div key={side} className={cn("rounded-2xl p-4 text-center", c.bg, leading && "ring-2", leading && c.ring)}>
                    <div className={cn("text-[12px] font-extrabold uppercase tracking-wide", c.text)}>{c === SIDE_COLOR.A ? "🟣" : "🔵"} Group {side} {leading && "👑"}</div>
                    <div className="mt-1.5 text-[24px] font-extrabold tabular-nums sm:text-[30px]">{peso(t.totalProfitPesos)}</div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/60">
                      <div className={cn("h-full w-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-out)]", side === "A" ? "bg-violet" : "bg-blue")} style={{ transform: `scaleX(${Math.min(100, t.contributionPct) / 100})` }} />
                    </div>
                    <div className="mt-1 text-[10.5px] font-bold text-[var(--gray)]">{t.contributionPct}% of target</div>
                  </div>
                );
              })}
            </div>
            <div className="my-3 text-center text-[11px] font-extrabold uppercase tracking-widest text-[var(--gray)]">VS</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--line)] pt-4 text-center text-[12px] sm:grid-cols-4">
              <Stat label="Revenue" a={peso(teamBattle.A.totalRevenuePesos)} b={peso(teamBattle.B.totalRevenuePesos)} />
              <Stat label="Bookings" a={String(teamBattle.A.totalBookings)} b={String(teamBattle.B.totalBookings)} />
              <Stat label="Avg / Booker" a={peso(teamBattle.A.avgProfitPerBooker)} b={peso(teamBattle.B.avgProfitPerBooker)} />
              <Stat label="Avg / Booking" a={peso(teamBattle.A.avgProfitPerBooking)} b={peso(teamBattle.B.avgProfitPerBooking)} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Stat({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:block">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)] sm:mb-1">{label}</div>
      <div className="flex items-center justify-center gap-3 tabular-nums">
        <span className="font-extrabold text-violet">{a}</span>
        <span className="text-[var(--gray)]">·</span>
        <span className="font-extrabold text-blue">{b}</span>
      </div>
    </div>
  );
}
