"use client";

import { useEffect, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { WorldMapProgress, EliteBadgeButton, AchievementBadgeCard } from "@/components/earnings/WorldMapProgress";

type EliteTierStatus = { tier: number; amount: number; stars: number; badge: string; medal: string; slotsTotal: number; slotsTaken: number; wonByMe: boolean };
type EliteChallenge = {
  metric: "bookings" | "cleaningDays";
  completedThisMonth: number; rank: number; totalBookers: number;
  currentTier: number | null; currentStars: number; currentBadge: string | null;
  nextTier: number | null; nextTierAmount: number | null; remaining: number; progressPct: number;
  slotsRemainingForNextTier: number; slotsTotalForNextTier: number;
  estimatedCommission: number; potentialBonus: number; tiers: EliteTierStatus[];
};
type Achievement = { id: string; label: string; unlocked: boolean; threshold?: number; rewardAmount?: number; personalMessage?: string | null };
type MyEarnings = { employee: { id: string }; eliteChallenge: EliteChallenge | null; achievements: Achievement[] };

// The same Elite Challenge world map + Achievements gallery shown on My
// Earnings, surfaced here too for the logged-in cleaner — same data source
// (/api/my-earnings), just rendered inline on the Housekeeping page instead
// of requiring a separate visit. Renders nothing if this account has no
// linked Employee record or isn't a payroll role (e.g. an Owner/Admin just
// viewing this page operationally).
export function HousekeepingChallengeCard() {
  const [data, setData] = useState<MyEarnings | null>(null);

  useEffect(() => {
    fetch("/api/my-earnings")
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => {});
  }, []);

  if (!data?.eliteChallenge) return null;
  const challenge = data.eliteChallenge;

  return (
    <>
      <Accordion title="Monthly Elite Housekeeper Challenge" sub="resets on the 1st of every month">
        <div className="mb-4">
          <WorldMapProgress challenge={challenge} employeeId={data.employee.id} />
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
          {challenge.tiers.map((t, i) => <EliteBadgeButton key={t.tier} tier={t} index={i} metric={challenge.metric} />)}
        </div>
      </Accordion>

      <Accordion title="Achievements">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.achievements.map((a, i) => <AchievementBadgeCard key={a.id} a={a} index={i} />)}
        </div>
      </Accordion>
    </>
  );
}
