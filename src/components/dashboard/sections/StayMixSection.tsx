import { Accordion } from "@/components/ui/Accordion";
import { STAY_TYPES } from "@/lib/constants";

export function StayMixSection({
  stayCounts,
  stayTotal,
}: {
  stayCounts: Record<string, number>;
  stayTotal: number;
}) {
  return (
    <Accordion title="Stay mix" sub={`${stayTotal} bookings`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["Daycation", "Night", "Full"] as const).map((k) => {
          const pct = Math.round((stayCounts[k] / stayTotal) * 100);
          const meta = STAY_TYPES[k];
          return (
            <div key={k} className="stat-card">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold">{stayCounts[k]}</span>
                <span className="text-sm font-bold" style={{ color: meta.color }}>{pct}%</span>
              </div>
              <div className="mt-1 text-sm font-bold">{meta.label} <span className="text-xs font-semibold text-[var(--gray)]">{meta.hrs}</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
                <div className="h-full w-full origin-left rounded-full transition-transform duration-200 ease-[var(--ease-out)]" style={{ transform: `scaleX(${pct / 100})`, background: meta.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </Accordion>
  );
}
