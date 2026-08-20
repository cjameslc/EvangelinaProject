"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { peso } from "@/lib/format";
import type { CampaignParticipantInput, DailyPoint } from "@/lib/campaignEngine/types";

const LINE_COLORS = ["#FF385C", "#6C5CE7", "#00A699", "#E8A400", "#3B71E8", "#FF7A5C"];

/**
 * Two display modes, driven by the server's dailySeriesMode — never a
 * client-side choice, since the underlying numbers already mean something
 * different by the time they arrive: "profit" (admin) plots real
 * cumulative pesos; "rank" (everyone else) plots each booker's daily
 * leaderboard position instead, with the Y-axis reversed so #1 sits at
 * the top — same "who was ahead when" story, zero dollar figures.
 */
export function ProfitTrendChart({ daily, participants, mode, totalParticipants }: { daily: DailyPoint[]; participants: CampaignParticipantInput[]; mode: "profit" | "rank"; totalParticipants: number }) {
  if (daily.length === 0) {
    return <div className="grid h-[260px] place-items-center text-[13px] text-[var(--gray)]">No bookings yet this campaign.</div>;
  }
  const chartData = daily.map((d) => {
    const row: Record<string, number | string> = { date: d.dateIso.slice(5) };
    for (const p of participants) row[p.employeeId] = d.byEmployee[p.employeeId] ?? (mode === "rank" ? totalParticipants : 0);
    return row;
  });
  const yFormatter = mode === "profit" ? (v: number) => peso(v) : (v: number) => `#${v}`;
  const tooltipFormatter = (value: any, name: any) => [mode === "profit" ? peso(Number(value)) : `#${value}`, participants.find((p) => p.employeeId === name)?.name ?? name];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--gray)" />
        <YAxis
          tick={{ fontSize: 11 }} stroke="var(--gray)" tickFormatter={yFormatter} width={mode === "profit" ? 70 : 36}
          reversed={mode === "rank"} allowDecimals={false} domain={mode === "rank" ? [1, totalParticipants] : undefined}
        />
        <Tooltip formatter={tooltipFormatter} labelStyle={{ fontWeight: 700 }} />
        <Legend formatter={(value: any) => participants.find((p) => p.employeeId === value)?.name ?? value} wrapperStyle={{ fontSize: 11 }} />
        {participants.map((p, i) => (
          <Line key={p.employeeId} type="monotone" dataKey={p.employeeId} name={p.employeeId} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
