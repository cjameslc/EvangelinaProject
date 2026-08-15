"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export type CountRow = { label: string; count: number };

export function CountBarChart({ data, color = "var(--skin-primary, #6c5ce7)" }: { data: CountRow[]; color?: string }) {
  if (data.every((d) => d.count === 0)) {
    return <div className="grid h-[180px] place-items-center text-[13px] text-[var(--gray)]">No bookings in this period yet.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10.5 }} stroke="var(--gray)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--gray)" allowDecimals={false} />
        <Tooltip formatter={(value: any) => [value, "Bookings"]} labelStyle={{ fontWeight: 700 }} />
        <Bar dataKey="count" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
