"use client";

import dynamic from "next/dynamic";
import { DayOfWeekHeatmap } from "@/components/analytics/charts/DayOfWeekHeatmap";
import type { BookingAnalytics } from "@/app/analytics/queries";

const CountBarChart = dynamic(() => import("@/components/analytics/charts/CountBarChart").then((m) => m.CountBarChart), { ssr: false, loading: () => <div className="h-[180px] animate-pulse rounded-xl bg-[var(--bg-2)]" /> });

export function BookingSectionClient({ data }: { data: BookingAnalytics }) {
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.count));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-2 text-[14px] font-extrabold">Booking funnel</h3>
        <div className="space-y-2">
          {data.funnel.map((f) => (
            <div key={f.stage}>
              <div className="mb-0.5 flex items-center justify-between text-[12px] font-semibold">
                <span className={f.stage === "Cancelled" ? "text-rausch" : ""}>{f.stage}</span>
                <span>{f.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-2)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(f.count / maxFunnel) * 100}%`, background: f.stage === "Cancelled" ? "#FF385C" : "#00A699" }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-[14px] font-extrabold">Lead time</h3>
        <p className="mb-2 text-[11.5px] text-[var(--gray)]">How far in advance guests book, relative to check-in.</p>
        <CountBarChart data={data.leadTime.map((r) => ({ label: r.bucket, count: r.count }))} />
      </div>

      <div className="card p-4">
        <h3 className="mb-2 text-[14px] font-extrabold">Peak days</h3>
        <div className="space-y-4">
          <DayOfWeekHeatmap data={data.peakBookingDays} label="Booked on" />
          <DayOfWeekHeatmap data={data.peakCheckInDays} label="Check-in day" />
          <DayOfWeekHeatmap data={data.peakCheckOutDays} label="Check-out day" />
        </div>
      </div>
    </div>
  );
}
