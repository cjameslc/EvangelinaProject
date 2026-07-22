"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { peso, fmtDate } from "@/lib/format";
import type { RevenueAnalytics } from "@/app/analytics/queries";

// Recharts is only fetched once this component actually mounts on the
// client — ssr:false keeps it out of the server bundle entirely, and the
// dynamic import keeps it out of every OTHER page's client bundle too
// (matches the existing lazy-import("jspdf") pattern used for exports
// elsewhere in this app, just via next/dynamic instead of a click-handler
// import() since this is a component, not a one-shot action).
const RevenueLineChart = dynamic(() => import("@/components/analytics/charts/RevenueLineChart").then((m) => m.RevenueLineChart), { ssr: false, loading: () => <ChartSkeleton height={260} /> });
const RevenueBarChart = dynamic(() => import("@/components/analytics/charts/RevenueBarChart").then((m) => m.RevenueBarChart), { ssr: false, loading: () => <ChartSkeleton height={220} /> });
const RevenueDonutChart = dynamic(() => import("@/components/analytics/charts/RevenueDonutChart").then((m) => m.RevenueDonutChart), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

function ChartSkeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-xl bg-[var(--bg-2)]" style={{ height }} />;
}

function bucketMatches(dateIso: string, bucket: string, granularity: "day" | "week" | "month"): boolean {
  if (granularity === "month") return dateIso.slice(0, 7) === bucket;
  // day/week buckets are both a YYYY-MM-DD key — for "week" that's the
  // Sunday the week starts on, so match anything within the 7 days after it.
  const d = new Date(dateIso);
  const bucketDate = new Date(`${bucket}T00:00:00Z`);
  if (granularity === "day") return d.toISOString().slice(0, 10) === bucket;
  const end = new Date(bucketDate);
  end.setUTCDate(end.getUTCDate() + 7);
  return d >= bucketDate && d < end;
}

export function RevenueSectionClient({ data }: { data: RevenueAnalytics }) {
  const [drillBucket, setDrillBucket] = useState<string | null>(null);

  const drillBookings = useMemo(() => {
    if (!drillBucket) return [];
    return data.bookings.filter((b) => bucketMatches(b.date, drillBucket, data.granularity));
  }, [drillBucket, data.bookings, data.granularity]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[14px] font-extrabold">Revenue trend</h3>
          <span className="text-[11.5px] text-[var(--gray)]">by {data.granularity} — click a point for details</span>
        </div>
        <RevenueLineChart data={data.series} onPointClick={(bucket) => setDrillBucket((prev) => (prev === bucket ? null : bucket))} />
        {drillBucket && (
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12.5px] font-extrabold">{drillBucket} — {drillBookings.length} booking{drillBookings.length === 1 ? "" : "s"}</span>
              <button onClick={() => setDrillBucket(null)} className="text-[11.5px] font-semibold text-[var(--gray)] underline">Close</button>
            </div>
            {drillBookings.length === 0 ? (
              <p className="text-[12.5px] text-[var(--gray)]">No bookings for this bucket.</p>
            ) : (
              <div className="space-y-1.5">
                {drillBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-[12.5px]">
                    <span>{fmtDate(b.date, { month: "short", day: "numeric", timeZone: "UTC" })} · {b.unitLabel} · {b.stayType}</span>
                    <span className="font-bold">{peso(b.amount)} {!b.paid && <span className="text-amber">(unpaid)</span>}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Revenue by unit</h3>
          <RevenueBarChart data={data.byUnit} />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Revenue by booking source</h3>
          <RevenueDonutChart data={data.bySource} />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Revenue by stay type</h3>
          <RevenueBarChart data={data.byStayType} />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Revenue by payment method</h3>
          <RevenueBarChart data={data.byPaymentMethod} />
        </div>
      </div>
    </div>
  );
}
