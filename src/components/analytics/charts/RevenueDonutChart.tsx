"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { peso } from "@/lib/format";

export type DimensionRow = { key: string; label: string; collectedCentavos: number; count: number };

const COLORS = ["#FF385C", "#6C5CE7", "#00A699", "#C87D00", "#8E99AA", "#484848"];

export function RevenueDonutChart({ data }: { data: DimensionRow[] }) {
  const chartData = data.map((d) => ({ name: d.label, value: Math.round(d.collectedCentavos / 100) })).filter((d) => d.value > 0);

  if (chartData.length === 0) {
    return <div className="grid h-[220px] place-items-center text-[13px] text-[var(--gray)]">No bookings in this period yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: any) => peso(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 11.5, fontWeight: 700 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
