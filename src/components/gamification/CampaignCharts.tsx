"use client";

import dynamic from "next/dynamic";
import type { CampaignDashboardData } from "@/lib/campaignEngine/types";

// Recharts only loads once this section actually mounts — same
// established pattern as Analytics' RevenueSectionClient, keeps the
// dependency out of every other page's client bundle.
const ProfitTrendChart = dynamic(() => import("./charts/ProfitTrendChart").then((m) => m.ProfitTrendChart), { ssr: false, loading: () => <ChartSkeleton height={280} /> });
const TargetProgressChart = dynamic(() => import("./charts/TargetProgressChart").then((m) => m.TargetProgressChart), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

function ChartSkeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-xl bg-[var(--bg-2)]" style={{ height }} />;
}

// Prioritizes visual storytelling over exhaustive charting — two charts
// (profit trend per booker, cumulative progress toward target), not four,
// per the brief's own "do not overload the page with charts" instruction.
// The Team Battle section above already visualizes the Group A/B
// comparison, so a third "stacked battle" chart would be redundant.
export function CampaignCharts({ data }: { data: CampaignDashboardData }) {
  if (data.ranked.length === 0) return null;
  return (
    <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card p-4 sm:p-5">
        <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{data.dailySeriesMode === "profit" ? "Profit Trend" : "Rank Trend"}</h2>
        <ProfitTrendChart daily={data.dailySeries} participants={data.ranked} mode={data.dailySeriesMode} totalParticipants={data.ranked.length} />
      </div>
      <div className="card p-4 sm:p-5">
        <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Target Progress</h2>
        <TargetProgressChart daily={data.dailySeries} targetPesos={data.targetPesos} />
      </div>
    </section>
  );
}
