import { useMemo } from "react";
import type { Unit } from "../types";

// Reserve access-code pool health, per unit — feeds both the "Emergency
// Access Codes" widget and the exhaustion attention item. A unit with
// reserve codes provisioned but zero AVAILABLE means the very next TTLock
// outage during a booking would leave a guest with no code at all.
export function useReserveCodeStats({
  reserveAccessCodes,
  units,
}: {
  reserveAccessCodes: { unitId: string; status: string }[];
  units: Unit[];
}) {
  return useMemo(() => {
    const byUnit = new Map<string, { total: number; available: number }>();
    for (const c of reserveAccessCodes) {
      const s = byUnit.get(c.unitId) ?? { total: 0, available: 0 };
      s.total++;
      if (c.status === "AVAILABLE") s.available++;
      byUnit.set(c.unitId, s);
    }
    const total = reserveAccessCodes.length;
    const available = reserveAccessCodes.filter((c) => c.status === "AVAILABLE").length;
    const exhaustedUnits = units.filter((u) => (byUnit.get(u.id)?.total ?? 0) > 0 && (byUnit.get(u.id)?.available ?? 0) === 0);
    // Distinct from exhaustedUnits above (had a pool, ran it out) — a
    // locked unit that never got a pool provisioned at all has exactly the
    // same "no fallback if TTLock is down" exposure, but total=0 excludes
    // it from that filter entirely. Found via a real gateway outage where
    // one unit's emergency-access button had nothing to fall back to.
    const neverProvisionedUnits = units.filter((u) => !!u.ttlockLockId && (byUnit.get(u.id)?.total ?? 0) === 0);
    return { byUnit, total, available, inUse: total - available, exhaustedUnits, neverProvisionedUnits };
  }, [reserveAccessCodes, units]);
}
