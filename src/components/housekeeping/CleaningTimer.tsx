"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Spec section 4 — expected 1h, max 2h. Purely a display convention (the
// actual overdue *notification* is server-side, lazily checked in
// GET /api/housekeeping — see that route). This just re-renders a local
// clock every 30s; no network calls, so it's not "polling" in the sense
// the app's performance conventions warn against.
const EXPECTED_MS = 1 * 3600 * 1000;
const MAX_MS = 2 * 3600 * 1000;

function fmtElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtClock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function CleaningTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startedAt);
  const elapsedMs = now.getTime() - start.getTime();
  const expectedFinish = new Date(start.getTime() + EXPECTED_MS);
  const maxFinish = new Date(start.getTime() + MAX_MS);
  const progressPct = Math.min(100, (elapsedMs / MAX_MS) * 100);

  const tone = elapsedMs < EXPECTED_MS ? "green" : elapsedMs < MAX_MS ? "yellow" : "red";
  const colors = { green: "#1E9E52", yellow: "#E08A2C", red: "#E1442D" }[tone];

  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
        <span>Started {fmtClock(start)}</span>
        <span style={{ color: colors }}>{tone === "red" ? "Overdue" : tone === "yellow" ? "Running long" : "On track"}</span>
      </div>
      <div className="mt-1 font-mono text-[22px] font-extrabold text-[var(--ink)]">{fmtElapsed(elapsedMs)}</div>
      {/* scaleX (compositor-only) instead of animating width, which forces
          layout+paint on every 30s tick — see EarningsSection.tsx's bar
          chart for the same technique. Color still transitions normally. */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div
          className={cn("h-full w-full origin-left rounded-full transition-[background-color,transform] duration-300 ease-[var(--ease-out)]")}
          style={{ transform: `scaleX(${progressPct / 100})`, background: colors }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-[var(--gray)]">
        <span>Expected finish {fmtClock(expectedFinish)}</span>
        <span>Max {fmtClock(maxFinish)}</span>
      </div>
    </div>
  );
}
