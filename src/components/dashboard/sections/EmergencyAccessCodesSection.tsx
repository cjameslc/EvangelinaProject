import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { fmtDate } from "@/lib/format";
import type { Unit } from "../types";

export function EmergencyAccessCodesSection({
  reserveCodeStats,
  ttlockStatus,
}: {
  reserveCodeStats: { total: number; available: number; inUse: number; exhaustedUnits: Unit[] };
  ttlockStatus: { lastSuccessAt: string | null; lastFailureAt: string | null; lastFailureMessage: string | null } | null;
}) {
  if (reserveCodeStats.total === 0) return null;

  return (
    <Accordion
      title="Emergency access codes"
      sub={ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt)) ? "TTLock issue detected" : "TTLock connected"}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total reserve codes" value={String(reserveCodeStats.total)} sub="across all units" />
        <StatCard label="Available" value={String(reserveCodeStats.available)} sub="ready for the next outage" />
        <StatCard
          label="In use"
          value={String(reserveCodeStats.inUse)}
          sub="assigned to a booking"
          warn={reserveCodeStats.exhaustedUnits.length > 0}
          tone={reserveCodeStats.exhaustedUnits.length > 0 ? "danger" : undefined}
        />
        <StatCard
          label="TTLock connection"
          value={ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt)) ? "Failing" : "OK"}
          sub={ttlockStatus?.lastFailureAt ? `Last failure ${fmtDate(ttlockStatus.lastFailureAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}` : "No failures recorded"}
          warn={!!ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt))}
        />
      </div>
      {reserveCodeStats.exhaustedUnits.length > 0 && (
        <p className="mt-3 rounded-lg bg-rausch/10 px-3 py-2 text-[12.5px] font-semibold text-rausch">
          ⚠️ {reserveCodeStats.exhaustedUnits.map((u) => u.shortName).join(", ")} {reserveCodeStats.exhaustedUnits.length === 1 ? "has" : "have"} zero available emergency codes left.
        </p>
      )}
    </Accordion>
  );
}
