import { Accordion } from "@/components/ui/Accordion";
import { peso, formatUnitDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { collectedAmountPesos } from "@/lib/finance";
import type { Unit, Booking } from "../types";

export function YourListingsSection({
  units,
  bookingsWeek,
  unitStatus,
  batteryTier,
}: {
  units: Unit[];
  bookingsWeek: Booking[];
  unitStatus: (unit: Unit) => { label: string; dot: string };
  batteryTier: (pct: number | null | undefined) => "critical" | "low" | "healthy" | null;
}) {
  return (
    <Accordion title="Your listings" sub={`${units.length} listings`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => {
          const st = unitStatus(u);
          const earn = bookingsWeek.filter((b) => b.unitId === u.id).reduce((s, b) => s + collectedAmountPesos(b), 0);
          return (
            <div key={u.id} className="card overflow-hidden">
              {u.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.photoUrl} alt={u.name} className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-violet/20 to-violet/5 text-3xl">🏠</div>
              )}
              <div className="space-y-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold">{formatUnitDisplay(u.unitNumber, u.name)}</span>
                  <span className="text-[12px] font-bold text-amber">★ {u.rating.toFixed(1)}</span>
                </div>
                <div className="text-[11.5px] text-[var(--gray)]">{u.location}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold">
                  <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", st.dot)} /> {st.label}</span>
                  {u.ttlockLockId != null && (
                    <span className="flex items-center gap-1 text-[11px]">
                      🔋 {u.ttlockBatteryPct ?? "—"}%
                      {u.ttlockHasGateway === false && <span className="font-bold text-amber">· Offline</span>}
                      {batteryTier(u.ttlockBatteryPct) === "critical" && <span className="font-bold text-rausch">· Critical</span>}
                      {batteryTier(u.ttlockBatteryPct) === "low" && <span className="font-bold text-amber">· Low</span>}
                    </span>
                  )}
                </div>
                <div className="pt-1">
                  <div className="text-sm font-extrabold">{peso(u.nightlyRate)} <span className="text-xs font-semibold text-[var(--gray)]">night</span></div>
                  <div className="mt-0.5 text-sm font-extrabold text-green">{peso(earn)} <span className="text-[11px] font-semibold text-[var(--gray)]">wk</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Accordion>
  );
}
