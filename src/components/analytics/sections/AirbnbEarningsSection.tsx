import { getAirbnbEarningsComparison, type AnalyticsFilters } from "@/app/analytics/queries";
import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTH_LABEL = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_SHORT = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });

type MonthRow = {
  month: string;
  reportedTotalPesos: number | null;
  appTrackedRevenuePesos: number;
  unitDetail: { unitId: string | null; unitLabel: string; totalPesos: number }[] | null;
};

/**
 * Airbnb's own reported monthly earnings (imported from the host account's
 * PDF earnings reports) as a bar chart — same visual language as the
 * Dashboard's own "Earnings" card (bar-per-period, dark hover tooltip,
 * uppercase muted labels) so it reads as part of the same family instead of
 * a bolted-on table. Only the monthly totals are shown here — no nights/
 * reservations/salary breakdown, since none of that applies to a PDF-
 * sourced platform total.
 */
export async function AirbnbEarningsSection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const { months } = (await getAirbnbEarningsComparison(user, filters)) as { months: MonthRow[] };
  if (months.length === 0) return null;

  // Fixed to the requested Feb 2025 - Mar 2026 window (not derived from
  // whatever data happens to be present) so a gap in the middle of the
  // range — e.g. no report imported yet for Jan-Mar 2026 — still shows up
  // even though it isn't between the first and last imported month.
  const allMonthsInRange: string[] = [];
  {
    const cur = new Date("2025-02-01T00:00:00Z");
    const end = new Date("2026-03-01T00:00:00Z");
    while (cur <= end) {
      allMonthsInRange.push(cur.toISOString());
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const missingMonths = allMonthsInRange.filter((m) => !byMonth.has(m));
  const totalReported = months.reduce((s, m) => s + (m.reportedTotalPesos ?? 0), 0);

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-extrabold">Airbnb earnings</h3>
        <span className="text-[11px] font-semibold text-[var(--gray)]">Feb 2025 – Mar 2026</span>
      </div>
      <p className="mt-0.5 text-[12px] text-[var(--gray)]">From Airbnb&rsquo;s own monthly reports</p>

      <div className="mt-3 text-[32px] font-extrabold tracking-tight">{peso(totalReported)}</div>
      <p className="text-[12px] text-[var(--gray)]">total reported across the range</p>

      <div className="mt-5 flex h-[130px] items-end gap-1.5 sm:gap-2.5">
        {(() => {
          const max = Math.max(1, ...allMonthsInRange.map((m) => byMonth.get(m)?.reportedTotalPesos ?? 0));
          return allMonthsInRange.map((m) => {
            const row = byMonth.get(m);
            const amount = row?.reportedTotalPesos ?? null;
            const d = new Date(m);
            return (
              <div key={m} className="group relative flex flex-1 flex-col items-center gap-1.5">
                {amount !== null && (
                  <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1c1c1e] px-2.5 py-1.5 text-center opacity-0 shadow-card transition-opacity group-hover:opacity-100">
                    <div className="text-[11px] font-extrabold text-white">{peso(amount)}</div>
                    <div className="text-[10px] font-semibold text-white/70">{MONTH_LABEL.format(d)}</div>
                  </div>
                )}
                <div
                  className={cn("w-full max-w-[28px] rounded-t-md transition-all group-hover:brightness-110", amount !== null && amount > 0 ? "bg-rausch" : "bg-[var(--bg-2)]")}
                  style={{ height: `${amount !== null ? Math.max(4, Math.round((amount / max) * 80)) : 4}px` }}
                />
                <span className="text-[9.5px] font-semibold text-[var(--gray)]">
                  {MONTH_SHORT.format(d)}{d.getUTCMonth() === 0 ? ` '${String(d.getUTCFullYear()).slice(2)}` : ""}
                </span>
              </div>
            );
          });
        })()}
      </div>

      {missingMonths.length > 0 && (
        <p className="mt-4 rounded-lg bg-amber/10 px-3 py-2 text-[11.5px] text-amber">
          No Airbnb report imported yet for: {missingMonths.map((m) => MONTH_LABEL.format(new Date(m))).join(", ")}.
        </p>
      )}
    </div>
  );
}
