"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { peso } from "@/lib/format";

export type RevenuePoint = { bucket: string; grossCentavos: number; collectedCentavos: number };

// Recharts itself is only ever loaded when this component actually mounts
// — see RevenueSection.tsx's next/dynamic(..., { ssr: false }) import —
// so no other page's bundle grows from adding this dependency.
export function RevenueLineChart({ data, onPointClick }: { data: RevenuePoint[]; onPointClick?: (bucket: string) => void }) {
  const chartData = data.map((d) => ({ ...d, gross: Math.round(d.grossCentavos / 100), collected: Math.round(d.collectedCentavos / 100) }));

  if (chartData.length === 0) {
    return <div className="grid h-[260px] place-items-center text-[13px] text-[var(--gray)]">No bookings in this period yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart
        data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        onClick={(e: any) => {
          // Recharts v3 dropped the v2 activePayload/activeLabel-on-click
          // shape in favor of activeIndex — resolve the bucket from our own
          // chartData instead of trusting a label field that isn't reliably
          // populated on click.
          const idx = Number(e?.activeIndex);
          const bucket = Number.isInteger(idx) ? chartData[idx]?.bucket : undefined;
          if (bucket && onPointClick) onPointClick(bucket);
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="var(--gray)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--gray)" tickFormatter={(v) => peso(v)} width={70} />
        <Tooltip formatter={(value: any, name: any) => [peso(Number(value)), name === "gross" ? "Gross" : "Collected"]} labelStyle={{ fontWeight: 700 }} />
        <Line type="monotone" dataKey="gross" stroke="#8E99AA" strokeWidth={2} dot={false} name="gross" />
        <Line
          type="monotone" dataKey="collected" stroke="var(--skin-primary, #6c5ce7)" strokeWidth={2.5} name="collected"
          dot={{ r: 4, style: { cursor: onPointClick ? "pointer" : "default" } } as any}
          activeDot={{ r: 6, style: { cursor: onPointClick ? "pointer" : "default" } } as any}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
