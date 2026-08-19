"use client";

import { useMemo, useState } from "react";
import { CameraIcon } from "@/components/ui/Icons";
import { formatUnitDisplay, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MeterCaptureModal } from "./MeterCaptureModal";
import { MeterHistoryDrawer } from "./MeterHistoryDrawer";
import { MeterMetricsPanel } from "./MeterMetricsPanel";

type Unit = { id: string; name: string; shortName: string; unitNumber?: string };
type Reading = {
  id: string;
  unitId: string;
  meterType: string;
  readingValue: number | null;
  rawDisplay: string | null;
  readingUnit: string | null;
  readingConfidence: number;
  consumption: number | null;
  anomalyDetected: boolean;
  recommendedAction: string;
  createdAt: string;
  photoUrl: string;
  loggedByName: string | null;
};

const METER_TYPES = [
  { key: "WATER" as const, emoji: "💧", label: "Water" },
  { key: "ELECTRICITY" as const, emoji: "⚡", label: "Electricity" },
];

function confidenceDot(pct: number) {
  return pct >= 90 ? "bg-[var(--success)]" : pct >= 70 ? "bg-[var(--warning)]" : "bg-rausch";
}

export function MeterReadingPanel({
  units, readings, canEdit, onChanged,
}: {
  units: Unit[];
  readings: Reading[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [view, setView] = useState<"log" | "metrics">("log");
  const [capture, setCapture] = useState<{ unitId: string; unitLabel: string; meterType: "WATER" | "ELECTRICITY" } | null>(null);
  const [history, setHistory] = useState<{ unitId: string; unitLabel: string; meterType: "WATER" | "ELECTRICITY" } | null>(null);

  const latestByUnitType = useMemo(() => {
    const map = new Map<string, Reading>();
    for (const r of readings) {
      const key = `${r.unitId}::${r.meterType}`;
      const existing = map.get(key);
      if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) map.set(key, r);
    }
    return map;
  }, [readings]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <button onClick={() => setView("log")} className={cn("pill", view === "log" && "on")}>
          Log & History
        </button>
        <button onClick={() => setView("metrics")} className={cn("pill", view === "metrics" && "on")}>
          📊 Monthly metrics
        </button>
      </div>

      {view === "metrics" ? (
        <div key="metrics" className="panel-fade-in">
          <MeterMetricsPanel units={units} />
        </div>
      ) : (
      <div key="log" className="panel-fade-in space-y-3">
      {units.map((u) => {
        const unitLabel = formatUnitDisplay(u.unitNumber, u.shortName);
        return (
          <div key={u.id} className="card p-3.5">
            <div className="mb-2.5 text-[13.5px] font-extrabold">{unitLabel}</div>
            <div className="grid grid-cols-2 gap-2.5">
              {METER_TYPES.map((mt) => {
                const latest = latestByUnitType.get(`${u.id}::${mt.key}`);
                const readingsForType = readings.filter((r) => r.unitId === u.id && r.meterType === mt.key);
                return (
                  <div key={mt.key} className="rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[var(--gray)]">{mt.emoji} {mt.label}</span>
                      {latest && <span className={cn("h-1.5 w-1.5 rounded-full", confidenceDot(latest.readingConfidence))} aria-hidden="true" />}
                    </div>
                    {latest ? (
                      <button
                        onClick={() => setHistory({ unitId: u.id, unitLabel, meterType: mt.key })}
                        className="mt-1 block text-left transition duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]"
                      >
                        <div className="flex items-baseline gap-1 font-mono text-[19px] font-extrabold tabular-nums">
                          {latest.rawDisplay ?? latest.readingValue}
                          {latest.readingUnit && <span className="text-[11px] font-bold text-[var(--gray)]">{latest.readingUnit}</span>}
                        </div>
                        <div className="text-[11px] text-[var(--gray)]">{fmtDate(latest.createdAt)}</div>
                      </button>
                    ) : (
                      <div className="mt-1.5 text-[12.5px] text-[var(--gray)]">No reading yet</div>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setCapture({ unitId: u.id, unitLabel, meterType: mt.key })}
                        className="btn-sm btn-ghost mt-2 w-full justify-center border border-dashed border-[var(--line-2)]"
                      >
                        <CameraIcon className="h-3.5 w-3.5" /> Log reading
                      </button>
                    )}
                    {readingsForType.length > 0 && (
                      <button
                        onClick={() => setHistory({ unitId: u.id, unitLabel, meterType: mt.key })}
                        className="mt-1 w-full text-center text-[11px] font-semibold text-[var(--gray)] hover:text-[var(--ink)]"
                      >
                        {readingsForType.length} reading{readingsForType.length === 1 ? "" : "s"} logged
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
      )}

      {capture && (
        <MeterCaptureModal
          open
          onClose={() => setCapture(null)}
          unitId={capture.unitId}
          unitLabel={capture.unitLabel}
          meterType={capture.meterType}
          onSaved={onChanged}
        />
      )}

      {history && (
        <MeterHistoryDrawer
          open
          onClose={() => setHistory(null)}
          title={`${METER_TYPES.find((m) => m.key === history.meterType)?.emoji} ${METER_TYPES.find((m) => m.key === history.meterType)?.label} readings`}
          sub={history.unitLabel}
          readings={readings
            .filter((r) => r.unitId === history.unitId && r.meterType === history.meterType)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
        />
      )}
    </div>
  );
}
