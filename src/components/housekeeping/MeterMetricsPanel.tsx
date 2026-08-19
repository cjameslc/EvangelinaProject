"use client";

import { useEffect, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, AlertIcon } from "@/components/ui/Icons";
import { formatUnitDisplay, fmtDate, manilaMonthStart } from "@/lib/format";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; shortName: string; unitNumber?: string };
type MeterTotal = { consumption: number; readingCount: number; anomalyCount: number };
type MonthlyUnit = {
  unitId: string;
  shortName: string;
  unitNumber: string;
  water: MeterTotal;
  electricity: MeterTotal;
  previousWater: MeterTotal;
  previousElectricity: MeterTotal;
};

const METER_TYPES = [
  { key: "water" as const, prevKey: "previousWater" as const, emoji: "💧", label: "Water", unit: "m³" },
  { key: "electricity" as const, prevKey: "previousElectricity" as const, emoji: "⚡", label: "Electricity", unit: "kWh" },
];

function monthParamFor(offset: number): string {
  const d = manilaMonthStart();
  d.setUTCMonth(d.getUTCMonth() + offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFor(offset: number): string {
  const d = manilaMonthStart();
  d.setUTCMonth(d.getUTCMonth() + offset);
  return fmtDate(d, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Only occasionally viewed (a manager checking usage trends, not a
 * screen anyone stares at all day) — so unlike the capture flow, a real
 * "state changed" animation on month switch earns its place here rather
 * than being pure decoration. See the emil-design-eng skill call that
 * shaped this: bars animate via transform: scaleY (never `height` —
 * layout/paint on every frame vs. one GPU-composited property), numbers
 * get a cheaper blur+opacity dip since they don't carry the bar's
 * directional meaning. Both ride the app's existing --ease-out token and
 * the global prefers-reduced-motion rule already zeroes them out. */
export function MeterMetricsPanel({ units }: { units: Unit[] }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<MonthlyUnit[] | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setSwitching(true);
    let cancelled = false;
    fetch(`/api/housekeeping/meters/monthly?month=${monthParamFor(offset)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json.units);
      })
      .catch(() => {});
    // Fixed dwell, not tied to fetch latency — a sub-10ms cached response
    // would otherwise skip the transition entirely; this guarantees the
    // blur actually plays as the visible "something changed" cue.
    const t = setTimeout(() => !cancelled && setSwitching(false), 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [offset]);

  const maxByType: Record<"water" | "electricity", number> = {
    water: Math.max(1, ...(data ?? []).map((u) => u.water.consumption)),
    electricity: Math.max(1, ...(data ?? []).map((u) => u.electricity.consumption)),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2">
        <button
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Previous month"
          className="btn-icon h-9 w-9"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-[14px] font-extrabold">{monthLabelFor(offset)}</span>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          aria-label="Next month"
          disabled={offset >= 0}
          className="btn-icon h-9 w-9"
        >
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>

      {!data ? (
        <p className="py-6 text-center text-[13px] text-[var(--gray)]">Loading…</p>
      ) : (
        <div className="space-y-2.5">
          {units.map((u) => {
            const row = data.find((d) => d.unitId === u.id);
            return (
              <div key={u.id} className="card p-3.5">
                <div className="mb-2.5 text-[13.5px] font-extrabold">{formatUnitDisplay(u.unitNumber, u.shortName)}</div>
                <div className="grid grid-cols-2 gap-3">
                  {METER_TYPES.map((mt) => {
                    const total = row?.[mt.key] ?? { consumption: 0, readingCount: 0, anomalyCount: 0 };
                    const prevTotal = row?.[mt.prevKey] ?? { consumption: 0, readingCount: 0, anomalyCount: 0 };
                    const scale = Math.max(0.03, total.consumption / maxByType[mt.key]);
                    const deltaPct = prevTotal.consumption > 0 ? Math.round(((total.consumption - prevTotal.consumption) / prevTotal.consumption) * 100) : null;

                    return (
                      <div key={mt.key} className="flex flex-col">
                        <span className="text-[12px] font-bold text-[var(--gray)]">{mt.emoji} {mt.label}</span>

                        <div className="mt-1.5 flex h-14 items-end">
                          <div
                            className="meter-metric-bar w-6 rounded-t-md bg-[var(--skin-primary,#6c5ce7)]"
                            style={{ height: "100%", transform: `scaleY(${scale})` }}
                            aria-hidden="true"
                          />
                        </div>

                        <div className={cn("meter-metric-value mt-1.5", switching && "is-switching")}>
                          <div className="flex items-baseline gap-1 font-mono text-[17px] font-extrabold tabular-nums">
                            {Math.round(total.consumption * 10) / 10}
                            <span className="text-[10.5px] font-bold text-[var(--gray)]">{mt.unit}</span>
                          </div>
                          {deltaPct !== null && (
                            <span
                              className={cn(
                                "tag mt-0.5",
                                deltaPct > 0 ? "bg-[var(--warning)]/12 text-[var(--warning)]" : deltaPct < 0 ? "bg-[var(--success)]/12 text-[var(--success)]" : "bg-[var(--bg-2)] text-[var(--gray)]"
                              )}
                            >
                              {deltaPct > 0 ? "▲" : deltaPct < 0 ? "▼" : "—"} {Math.abs(deltaPct)}% vs last month
                            </span>
                          )}
                          {total.anomalyCount > 0 && (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-[var(--warning)]">
                              <AlertIcon className="h-3 w-3" /> {total.anomalyCount} flagged reading{total.anomalyCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
