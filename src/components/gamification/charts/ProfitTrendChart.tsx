"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { peso } from "@/lib/format";
import type { CampaignParticipantInput, DailyPoint } from "@/lib/campaignEngine/types";

const LINE_COLORS = ["#FF385C", "#6C5CE7", "#00A699", "#E8A400", "#3B71E8", "#FF7A5C"];

export function ProfitTrendChart({ daily, participants }: { daily: DailyPoint[]; participants: CampaignParticipantInput[] }) {
  if (daily.length === 0) {
    return <div className="grid h-[260px] place-items-center text-[13px] text-[var(--gray)]">No bookings yet this campaign.</div>;
  }
  const chartData = daily.map((d) => {
    const row: Record<string, number | string> = { date: d.dateIso.slice(5) };
    for (const p of participants) row[p.employeeId] = d.byEmployee[p.employeeId] ?? 0;
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--gray)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--gray)" tickFormatter={(v) => peso(v)} width={70} />
        <Tooltip formatter={(value: any, name: any) => [peso(Number(value)), participants.find((p) => p.employeeId === name)?.name ?? name]} labelStyle={{ fontWeight: 700 }} />
        <Legend formatter={(value: any) => participants.find((p) => p.employeeId === value)?.name ?? value} wrapperStyle={{ fontSize: 11 }} />
        {participants.map((p, i) => (
          <Line key={p.employeeId} type="monotone" dataKey={p.employeeId} name={p.employeeId} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
