"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { peso, fmtDate } from "@/lib/format";
import type { RevenueAnalytics } from "@/app/analytics/queries";
import { occupiedRange, rangesOverlap } from "@/lib/stayRange";

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

// The clicked bucket's own [start, end) range in calendar terms — mirrors
// the day/week/month key shapes revenueSeries() produces.
function bucketDateRange(bucket: string, granularity: "day" | "week" | "month"): { start: Date; end: Date } {
  if (granularity === "month") {
    const [y, m] = bucket.split("-").map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
  }
  const start = new Date(`${bucket}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (granularity === "week" ? 7 : 1));
  return { start, end };
}

export function RevenueSectionClient({ data }: { data: RevenueAnalytics }) {
  const [drillBucket, setDrillBucket] = useState<string | null>(null);

  const drillBookings = useMemo(() => {
    if (!drillBucket) return [];
    // Revenue is now prorated across every night a stay occupies, so the
    // bucket a guest checked in on isn't necessarily the only bucket their
    // booking contributes to — show every booking whose stay actually
    // overlaps the clicked bucket, not just ones checking in that exact day.
    const range = bucketDateRange(drillBucket, data.granularity);
    return data.bookings.filter((b) => {
      const occ = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
      return rangesOverlap(occ.start, occ.end, range.start, range.end);
    });
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
                    <span>
                      {fmtDate(b.date, { month: "short", day: "numeric", timeZone: "UTC" })}
                      {b.checkOutDate && b.checkOutDate !== b.date && <> → {fmtDate(b.checkOutDate, { month: "short", day: "numeric", timeZone: "UTC" })}</>}
                      {" "}· {b.unitLabel} · {b.stayType}
                    </span>
                    <span className="font-bold">{peso(b.amount)} (full stay) {!b.paid && <span className="text-amber">(unpaid)</span>}</span>
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
