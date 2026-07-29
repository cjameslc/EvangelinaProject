import { useMemo } from "react";
import type { Unit, Booking } from "../types";

// Smart Battery Health — tier classification uses the live, admin-editable
// Settings thresholds (batteryLowThresholdPct/batteryCriticalThresholdPct),
// not a hardcoded default — this is the one place in the app that actually
// gates real alerts on them (Admin → Units' own badge intentionally stays
// on the schema defaults, see that file's comment).
export function useBatteryHealth({
  units,
  bookingsWeek,
  batteryLowThresholdPct,
  batteryCriticalThresholdPct,
}: {
  units: Unit[];
  bookingsWeek: Booking[];
  batteryLowThresholdPct: number;
  batteryCriticalThresholdPct: number;
}) {
  function batteryTier(pct: number | null | undefined): "critical" | "low" | "healthy" | null {
    if (pct === null || pct === undefined) return null;
    if (pct <= batteryCriticalThresholdPct) return "critical";
    if (pct <= batteryLowThresholdPct) return "low";
    return "healthy";
  }
  const lockedUnits = useMemo(() => units.filter((u) => u.ttlockLockId != null), [units]);
  const batteryStats = useMemo(() => {
    let healthy = 0, low = 0, critical = 0, offline = 0, sum = 0, counted = 0;
    let lastUpdated: string | null = null;
    for (const u of lockedUnits) {
      if (u.ttlockHasGateway === false) offline++;
      const tier = batteryTier(u.ttlockBatteryPct);
      if (tier === "critical") critical++;
      else if (tier === "low") low++;
      else if (tier === "healthy") healthy++;
      if (typeof u.ttlockBatteryPct === "number") { sum += u.ttlockBatteryPct; counted++; }
      if (u.ttlockBatterySyncedAt && (!lastUpdated || u.ttlockBatterySyncedAt > lastUpdated)) lastUpdated = u.ttlockBatterySyncedAt;
    }
    return { healthy, low, critical, offline, average: counted > 0 ? Math.round(sum / counted) : null, lastUpdated };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedUnits, batteryLowThresholdPct, batteryCriticalThresholdPct]);

  // Cross-references battery health against the soonest future booking per
  // unit (same nextCheckIn lookup lateCleaningUnits does in NeedsAttention) —
  // a guest arriving within 48h at a unit whose lock is Low/Critical/offline
  // is a real risk of a failed check-in, worth a high-priority call-out
  // distinct from the general "battery is low" item.
  const upcomingCheckinRiskUnits = useMemo(() => {
    const now = Date.now();
    const in48h = now + 48 * 3600 * 1000;
    const results: { unit: Unit; nextCheckInAt: Date; tier: "critical" | "low" | "offline" }[] = [];
    for (const unit of lockedUnits) {
      const tier: "critical" | "low" | "offline" | null = unit.ttlockHasGateway === false ? "offline" : (batteryTier(unit.ttlockBatteryPct) === "critical" ? "critical" : batteryTier(unit.ttlockBatteryPct) === "low" ? "low" : null);
      if (!tier) continue;
      const nextCheckIn = bookingsWeek
        .filter((b) => b.unitId === unit.id && new Date(b.date).getTime() > now && new Date(b.date).getTime() <= in48h)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
      if (!nextCheckIn) continue;
      results.push({ unit, nextCheckInAt: new Date(nextCheckIn.date), tier });
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedUnits, bookingsWeek, batteryLowThresholdPct, batteryCriticalThresholdPct]);

  return { batteryTier, lockedUnits, batteryStats, upcomingCheckinRiskUnits };
}
