import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { fmtDate } from "@/lib/format";
import type { Unit } from "../types";

export function BatteryHealthSection({
  lockedUnits,
  batteryStats,
  batteryLowThresholdPct,
  batteryCriticalThresholdPct,
}: {
  lockedUnits: Unit[];
  batteryStats: { healthy: number; low: number; critical: number; offline: number; average: number | null; lastUpdated: string | null };
  batteryLowThresholdPct: number;
  batteryCriticalThresholdPct: number;
}) {
  if (lockedUnits.length === 0) return null;

  return (
    <Accordion
      title="Battery health"
      sub={batteryStats.lastUpdated ? `Updated ${fmtDate(batteryStats.lastUpdated, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}` : "Not synced yet"}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Healthy" value={String(batteryStats.healthy)} sub={`above ${batteryLowThresholdPct}%`} />
        <StatCard label="Low" value={String(batteryStats.low)} sub={`${batteryCriticalThresholdPct + 1}–${batteryLowThresholdPct}%`} warn={batteryStats.low > 0} tone={batteryStats.low > 0 ? "caution" : undefined} />
        <StatCard label="Critical" value={String(batteryStats.critical)} sub={`${batteryCriticalThresholdPct}% or below`} warn={batteryStats.critical > 0} tone={batteryStats.critical > 0 ? "danger" : undefined} />
        <StatCard label="Offline" value={String(batteryStats.offline)} sub="not reporting" warn={batteryStats.offline > 0} tone={batteryStats.offline > 0 ? "caution" : undefined} />
        <StatCard label="Average battery" value={batteryStats.average !== null ? `${batteryStats.average}%` : "—"} sub={`${lockedUnits.length} lock${lockedUnits.length === 1 ? "" : "s"} linked`} />
      </div>
    </Accordion>
  );
}
