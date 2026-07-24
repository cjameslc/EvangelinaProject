"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export type DailyOrdersPoint = { label: string; count: number };

/** Daily Laundry Orders — last 14 days. Same visual language (rausch bars,
 * plain theme) as the Analytics revenue charts, adapted for a plain count
 * instead of pesos. */
export function LaundryOrdersChart({ data }: { data: DailyOrdersPoint[] }) {
  if (data.every((d) => d.count === 0)) {
    return <div className="grid h-[220px] place-items-center text-[13px] text-[var(--gray)]">No laundry orders in the last 14 days.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10.5 }} stroke="var(--gray)" interval={1} />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--gray)" allowDecimals={false} width={28} />
        <Tooltip formatter={(value: any) => [value, "Orders"]} labelStyle={{ fontWeight: 700 }} />
        <Bar dataKey="count" fill="#FF385C" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
