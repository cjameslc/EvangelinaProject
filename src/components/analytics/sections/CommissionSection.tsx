import { getCommissionAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";
import { peso } from "@/lib/format";

export async function CommissionSection({ user, filters }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters }) {
  const data = await getCommissionAnalytics(user, filters);

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-extrabold">Booker commission</h3>
          <p className="text-[11.5px] text-[var(--gray)]">
            ₱{data.bookerCommissionRate} per commission-eligible booking (paid, or cancelled with the deposit kept) — same formula as My Earnings and Dashboard&apos;s &ldquo;Your team&rdquo;.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Total this period</div>
          <div className="text-[20px] font-extrabold tracking-tight">{peso(Math.round(data.totalCommissionCentavos / 100))}</div>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <p className="text-[13px] text-[var(--gray)]">No commission-eligible bookings logged in this period.</p>
      ) : (
        <div className="space-y-2">
          {data.rows.map((row, i) => (
            <div key={row.employeeId} className="flex items-center justify-between rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[11px] font-extrabold text-[var(--gray)]">{i + 1}</span>
                <div>
                  <div className="text-[13px] font-extrabold">{row.name}</div>
                  <div className="text-[11.5px] text-[var(--gray)]">{row.bookingsCount} commission-eligible booking{row.bookingsCount !== 1 ? "s" : ""}</div>
                </div>
              </div>
              <div className="text-[14px] font-extrabold">{peso(Math.round(row.commissionCentavos / 100))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
