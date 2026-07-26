"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { peso, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UnsplashImage } from "@/components/guest/UnsplashImage";
import { pickStable } from "@/lib/unsplash/pick";
import type { UnsplashImage as UnsplashImageData } from "@/lib/unsplash/types";
import { Handshake, Sparkles, Wrench, Users, TrendingUp } from "lucide-react";

type TeamMember = { id: string; name: string; count: number };
type PriorityUnit = { unitId: string; unitLabel: string; pctComplete: number; currentPesos: number; targetPesos: number; remainingPesos: number; status: string } | null;
type Team = {
  key: string; name: string; theme: string; accent: "blue" | "green" | "orange";
  members: TeamMember[]; metricLabel: string; metricValue: number; priorityUnit: PriorityUnit;
};

const ACCENT: Record<Team["accent"], { text: string; bg: string; border: string; solid: string }> = {
  blue: { text: "text-[#3B71E8]", bg: "bg-[#3B71E8]/10", border: "border-[#3B71E8]/30", solid: "#3B71E8" },
  green: { text: "text-green", bg: "bg-green/10", border: "border-green/30", solid: "#008A05" },
  orange: { text: "text-[#EA580C]", bg: "bg-[#EA580C]/10", border: "border-[#EA580C]/30", solid: "#EA580C" },
};
const TEAM_ICON: Record<string, React.ComponentType<{ className?: string }>> = { booking: Handshake, housekeeping: Sparkles, operations: Wrench };
const STATUS_LABEL: Record<string, string> = { achieved: "Target hit", ahead: "Ahead of pace", on_track: "On track", behind: "Behind pace", at_risk: "At risk" };

/**
 * Company-wide "Teams" gamification section on My Earnings — a display-only
 * grouping of staff by their existing role (Booking = BOOKER, Housekeeping
 * = HOUSEKEEPING, Operations = OWNER_ADMIN/CO_OWNER; no new "team" concept
 * in the schema). Each team's "priority unit" is real, not decorative — the
 * unit currently furthest behind its Monthly Revenue Target, one per team
 * (worst 3 units, ranked), reusing the same computeUnitGoal() math the
 * Dashboard/Analytics goal panels already use — see /api/gamification/teams.
 */
export function TeamsSection({ teamImages, unitImages }: { teamImages?: Record<string, UnsplashImageData[]>; unitImages?: Record<string, UnsplashImageData[]> }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  useEffect(() => {
    fetch("/api/gamification/teams").then((r) => (r.ok ? r.json() : null)).then((j) => j && setTeams(j.teams)).catch(() => {});
  }, []);

  const unitImagePool = useMemo(() => Object.values(unitImages ?? {}).flat(), [unitImages]);

  if (!teams) return null;

  return (
    <Accordion title="Teams" sub="who's driving the business forward this month">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {teams.map((team) => (
          <TeamCard key={team.key} team={team} heroImage={pickStable(teamImages?.[`team-${team.key}`] ?? [], team.key)} priorityUnitImage={pickStable(unitImagePool, team.priorityUnit?.unitId ?? team.key)} />
        ))}
      </div>
    </Accordion>
  );
}

function TeamCard({ team, heroImage, priorityUnitImage }: { team: Team; heroImage: UnsplashImageData | null; priorityUnitImage: UnsplashImageData | null }) {
  const accent = ACCENT[team.accent];
  const Icon = TEAM_ICON[team.key] ?? Users;

  return (
    <div className={cn("group overflow-hidden rounded-2xl border transition-all hover:-translate-y-1 hover:shadow-card", accent.border)}>
      <div className="relative h-24 overflow-hidden">
        <UnsplashImage image={heroImage} alt={team.name} className="absolute inset-0 h-full w-full" showAttribution={false} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full backdrop-blur-sm" style={{ background: `${accent.solid}CC` }}>
            <Icon className="h-4 w-4 text-white" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-extrabold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">{team.name}</div>
            <div className="truncate text-[10.5px] font-semibold text-white/80">{team.theme}</div>
          </div>
        </div>
      </div>

      <div className="p-3.5">
        <div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2.5", accent.bg)}>
          <TrendingUp className={cn("h-4 w-4 flex-none", accent.text)} />
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)]">{team.metricLabel}</div>
            <div className={cn("text-[17px] font-extrabold", accent.text)}>
              {team.key === "operations" ? peso(team.metricValue) : team.metricValue}
            </div>
          </div>
        </div>

        {team.members.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {team.members.map((m) => (
              <div key={m.id} title={m.name} className="flex items-center gap-1.5 rounded-full border border-[var(--line)] py-1 pl-1 pr-2.5">
                <span className="grid h-5 w-5 place-items-center rounded-full text-[8.5px] font-bold text-white" style={{ background: accent.solid }}>
                  {initials(m.name)}
                </span>
                <span className="text-[11px] font-semibold">{m.name.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        )}

        {team.priorityUnit && <PriorityUnitCard unit={team.priorityUnit} accent={accent} image={priorityUnitImage} />}
      </div>
    </div>
  );
}

function PriorityUnitCard({ unit, accent, image }: { unit: NonNullable<PriorityUnit>; accent: (typeof ACCENT)[keyof typeof ACCENT]; image: UnsplashImageData | null }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)]">
      <div className="relative h-16 overflow-hidden">
        <UnsplashImage image={image} alt={unit.unitLabel} className="absolute inset-0 h-full w-full" showAttribution={false} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
        <div className="absolute left-2 top-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white backdrop-blur-sm">Priority unit</div>
        <div className="absolute inset-x-0 bottom-1.5 px-2.5 text-[11.5px] font-extrabold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">{unit.unitLabel}</div>
      </div>
      <div className="p-2.5">
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="text-[var(--gray)]">{STATUS_LABEL[unit.status] ?? unit.status}</span>
          <span className="font-bold">{unit.pctComplete}% of target</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, unit.pctComplete)}%`, background: accent.solid }} />
        </div>
        <div className="mt-1.5 text-[10.5px] text-[var(--gray)]">
          {peso(unit.currentPesos)} of {peso(unit.targetPesos)} — <span className="font-bold text-[var(--ink)]">{peso(unit.remainingPesos)}</span> to go
        </div>
      </div>
    </div>
  );
}
