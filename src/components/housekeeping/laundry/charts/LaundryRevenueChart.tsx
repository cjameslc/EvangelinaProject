"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { peso } from "@/lib/format";

export type RevenuePoint = { label: string; revenue: number };

/** Revenue Trends — last 14 days of laundry payments actually collected. */
export function LaundryRevenueChart({ data }: { data: RevenuePoint[] }) {
  if (data.every((d) => d.revenue === 0)) {
    return <div className="grid h-[220px] place-items-center text-[13px] text-[var(--gray)]">No laundry revenue in the last 14 days.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10.5 }} stroke="var(--gray)" interval={1} />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--gray)" tickFormatter={(v) => peso(v)} width={56} />
        <Tooltip formatter={(value: any) => [peso(Number(value)), "Revenue"]} labelStyle={{ fontWeight: 700 }} />
        <Line type="monotone" dataKey="revenue" stroke="#00A699" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
