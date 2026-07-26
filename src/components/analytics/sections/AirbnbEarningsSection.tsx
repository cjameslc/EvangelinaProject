import { getAirbnbEarningsComparison, type AnalyticsFilters } from "@/app/analytics/queries";
import { peso } from "@/lib/format";

const MONTH_LABEL = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });

type MonthRow = {
  month: string;
  reportedTotalPesos: number | null;
  appTrackedRevenuePesos: number;
  unitDetail: { unitId: string | null; unitLabel: string; totalPesos: number }[] | null;
};

/**
 * Airbnb's own reported monthly earnings (imported from the host account's
 * PDF earnings reports — a reference dataset, not derived from our own
 * bookings) shown side by side with what our own Booking records show for
 * Airbnb that same month, so a real gap between "what Airbnb paid out" and
 * "what we have on file" is visible at a glance. Months with no imported
 * report simply aren't in this table — see the gap note below it.
 */
export async function AirbnbEarningsSection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const { months } = (await getAirbnbEarningsComparison(user, filters)) as { months: MonthRow[] };
  if (months.length === 0) return null;

  const monthKeys = months.map((m) => m.month);
  const first = monthKeys[0].slice(0, 7);
  const last = monthKeys[monthKeys.length - 1].slice(0, 7);
  const allMonthsInRange: string[] = [];
  {
    const cur = new Date(first + "-01T00:00:00Z");
    const end = new Date(last + "-01T00:00:00Z");
    while (cur <= end) {
      allMonthsInRange.push(cur.toISOString());
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }
  const presentSet = new Set(monthKeys);
  const missingMonths = allMonthsInRange.filter((m) => !presentSet.has(m));

  return (
    <div className="card p-4">
      <h3 className="mb-1 text-[14px] font-extrabold">Airbnb official earnings — monthly view</h3>
      <p className="mb-3 text-[12px] text-[var(--gray)]">Imported from Airbnb's own PDF earnings reports, compared against what our booking records show for Airbnb that month.</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
              <th className="py-2 pr-3">Month</th>
              <th className="py-2 pr-3 text-right">Airbnb reported total</th>
              <th className="py-2 pr-3 text-right">Our tracked Airbnb revenue</th>
              <th className="py-2 text-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const diff = m.reportedTotalPesos !== null ? m.appTrackedRevenuePesos - m.reportedTotalPesos : null;
              return (
                <tr key={m.month} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-3 font-semibold">{MONTH_LABEL.format(new Date(m.month))}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{m.reportedTotalPesos !== null ? peso(m.reportedTotalPesos) : "—"}</td>
                  <td className="py-2 pr-3 text-right">{peso(m.appTrackedRevenuePesos)}</td>
                  <td className={`py-2 text-right font-bold ${diff === null ? "text-[var(--gray)]" : Math.abs(diff) < 1 ? "text-green" : "text-rausch"}`}>
                    {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${peso(diff)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {months.some((m) => m.unitDetail) && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Per-unit detail (months where Airbnb's report broke it out)</div>
          {months.filter((m) => m.unitDetail).map((m) => (
            <div key={m.month} className="mb-2">
              <div className="mb-1 text-[12px] font-semibold">{MONTH_LABEL.format(new Date(m.month))}</div>
              <div className="flex flex-wrap gap-1.5">
                {m.unitDetail!.map((u) => (
                  <span key={u.unitLabel} className="rounded-lg bg-[var(--bg-2)] px-2.5 py-1 text-[11.5px]">
                    {u.unitLabel}{!u.unitId && <span className="text-[var(--gray)]"> (other property)</span>}: <span className="font-bold">{peso(u.totalPesos)}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {missingMonths.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-[11.5px] text-amber">
          No Airbnb report imported yet for: {missingMonths.map((m) => MONTH_LABEL.format(new Date(m))).join(", ")}. Upload those reports to fill the gap.
        </p>
      )}
    </div>
  );
}
