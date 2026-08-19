"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { peso } from "@/lib/format";
import type { DailyPoint } from "@/lib/campaignEngine/types";

export function TargetProgressChart({ daily, targetPesos }: { daily: DailyPoint[]; targetPesos: number }) {
  if (daily.length === 0) {
    return <div className="grid h-[220px] place-items-center text-[13px] text-[var(--gray)]">No bookings yet this campaign.</div>;
  }
  const chartData = daily.map((d) => ({ date: d.dateIso.slice(5), total: d.totalProfitPesos }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="target-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--skin-primary, #6C5CE7)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--skin-primary, #6C5CE7)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--gray)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--gray)" tickFormatter={(v) => peso(v)} width={70} domain={[0, targetPesos]} />
        <Tooltip formatter={(value: any) => [peso(Number(value)), "Cumulative profit"]} labelStyle={{ fontWeight: 700 }} />
        <ReferenceLine y={targetPesos} stroke="#E8A400" strokeDasharray="5 4" label={{ value: `Target ${peso(targetPesos)}`, position: "insideTopRight", fontSize: 11, fill: "#E8A400", fontWeight: 700 }} />
        <Area type="monotone" dataKey="total" stroke="var(--skin-primary, #6C5CE7)" strokeWidth={2.5} fill="url(#target-fill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
