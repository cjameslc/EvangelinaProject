"use client";

import { Drawer } from "@/components/ui/Drawer";
import { AlertIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import { fmtDate, fmtTime } from "@/lib/format";

type Reading = {
  id: string;
  photoUrl: string;
  readingValue: number | null;
  rawDisplay: string | null;
  readingUnit: string | null;
  readingConfidence: number;
  consumption: number | null;
  anomalyDetected: boolean;
  recommendedAction: string;
  createdAt: string;
  loggedByName: string | null;
};

function confidenceTone(pct: number) {
  return pct >= 90 ? "text-[var(--success)]" : pct >= 70 ? "text-[var(--warning)]" : "text-rausch";
}

export function MeterHistoryDrawer({
  open, onClose, title, sub, readings,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub: string;
  readings: Reading[];
}) {
  return (
    <Drawer open={open} onClose={onClose} title={title} sub={sub} maxWidth={400}>
      {readings.length === 0 ? (
        <p className="text-[13.5px] text-[var(--gray)]">No readings logged yet.</p>
      ) : (
        <div className="space-y-2.5">
          {readings.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-2xl border border-[var(--line)] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.photoUrl} alt="" className="h-14 w-14 flex-none rounded-lg border border-[var(--line)] object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[17px] font-extrabold tabular-nums">{r.rawDisplay ?? r.readingValue ?? "—"}</span>
                  {r.readingUnit && <span className="text-[12px] font-bold text-[var(--gray)]">{r.readingUnit}</span>}
                  {r.anomalyDetected && <AlertIcon className="h-3.5 w-3.5 text-[var(--warning)]" />}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--gray)]">
                  {fmtDate(r.createdAt)} · {fmtTime(r.createdAt)}
                  {r.loggedByName ? ` · ${r.loggedByName}` : ""}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11.5px]">
                  <span className={cn("font-bold", confidenceTone(r.readingConfidence))}>{Math.round(r.readingConfidence)}%</span>
                  {r.consumption !== null && (
                    <span className="text-[var(--gray)]">
                      {r.consumption >= 0 ? "+" : ""}
                      {r.consumption} {r.readingUnit}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
