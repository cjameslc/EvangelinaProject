"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { peso } from "@/lib/format";

export type DimensionRow = { key: string; label: string; collectedCentavos: number; count: number };

export function RevenueBarChart({ data }: { data: DimensionRow[] }) {
  const chartData = data.map((d) => ({ ...d, collected: Math.round(d.collectedCentavos / 100) }));

  if (chartData.length === 0) {
    return <div className="grid h-[220px] place-items-center text-[13px] text-[var(--gray)]">No bookings in this period yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--gray)" tickFormatter={(v) => peso(v)} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 11.5, fontWeight: 700 }} stroke="var(--gray)" width={110} />
        <Tooltip formatter={(value: any, _name: any, item: any) => [peso(Number(value)), `${item.payload.count} booking${item.payload.count === 1 ? "" : "s"}`]} labelStyle={{ fontWeight: 700 }} />
        <Bar dataKey="collected" fill="var(--skin-primary, #6c5ce7)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
