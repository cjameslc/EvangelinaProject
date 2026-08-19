"use client";

import { fmtDate } from "@/lib/format";
import type { Achievement } from "@/lib/campaignEngine/types";

export function CampaignAchievements({ achievements }: { achievements: Achievement[] }) {
  if (achievements.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Recent Achievements</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {achievements.map((a, i) => (
          <div
            key={a.id}
            className="flex animate-fade-up items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 shadow-s"
            style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
          >
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[17px]">{a.emoji}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold leading-tight">{a.message}</div>
              <div className="text-[11px] font-semibold text-[var(--gray)]">{fmtDate(a.dateIso, { month: "short", day: "numeric" })}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
