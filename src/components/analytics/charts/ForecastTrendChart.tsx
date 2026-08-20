"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine, ResponsiveContainer } from "recharts";
import { peso } from "@/lib/format";

// A single stacked bar — Actual (realized) | Confirmed (booked, future) |
// Forecast (predicted additional) — against a Target reference line, so
// "actual" vs "predicted" money is visually distinct by segment color, not
// just by a legend a reader has to cross-reference (section 14: "clear
// visual distinction between actual and predicted data").
export type ForecastTrendPoint = { label: string; actualPesos: number; confirmedPesos: number; forecastPesos: number };

export function ForecastTrendChart({ data, targetPesos }: { data: ForecastTrendPoint[]; targetPesos: number }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--gray)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--gray)" tickFormatter={(v) => peso(v)} width={70} />
        <Tooltip formatter={(value: any, name: any) => [peso(Number(value)), name]} labelStyle={{ fontWeight: 700 }} />
        <Legend wrapperStyle={{ fontSize: 11.5 }} />
        {targetPesos > 0 && (
          <ReferenceLine y={targetPesos} stroke="#C87D00" strokeDasharray="5 4" strokeWidth={2} label={{ value: "Target", position: "right", fontSize: 11, fill: "#C87D00", fontWeight: 700 }} />
        )}
        {/* A certainty gradient on the app's own brand color, not the
            semantic teal/rausch pair used for good/bad elsewhere on this
            page — Actual/Confirmed/Forecast is a composition, not a value
            judgment, so it must not read as "realized = bad, predicted =
            good" by accident. Darkest = most certain (realized), lightest =
            least certain (predicted). */}
        <Bar dataKey="actualPesos" stackId="a" name="Actual" fill="var(--skin-primary, #6C5CE7)" fillOpacity={1} radius={[0, 0, 0, 0]} />
        <Bar dataKey="confirmedPesos" stackId="a" name="Confirmed" fill="var(--skin-primary, #6C5CE7)" fillOpacity={0.55} />
        <Bar dataKey="forecastPesos" stackId="a" name="Forecast (predicted)" fill="var(--skin-primary, #6C5CE7)" fillOpacity={0.22} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
