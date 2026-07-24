"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { LAUNDRY_STATUS_COLOR } from "../laundryStatusMeta";

export type StatusSlice = { key: string; label: string; count: number };

/** Order Status Distribution. */
export function LaundryStatusChart({ data }: { data: StatusSlice[] }) {
  if (data.length === 0) {
    return <div className="grid h-[220px] place-items-center text-[13px] text-[var(--gray)]">No laundry orders yet.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={LAUNDRY_STATUS_COLOR[d.key] ?? "#8E99AA"} />
          ))}
        </Pie>
        <Tooltip formatter={(value: any) => [value, "Orders"]} />
        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
