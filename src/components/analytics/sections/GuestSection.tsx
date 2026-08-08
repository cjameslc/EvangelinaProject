import { StatCard } from "@/components/ui/StatCard";
import { peso } from "@/lib/format";
import { getGuestAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";

export async function GuestSection({ user, filters }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters }) {
  const g = await getGuestAnalytics(user, filters);
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="mb-3 text-[14px] font-extrabold">Guests</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="New Guests" value={g.newGuestCount} />
          <StatCard label="Returning Guests" value={g.returningGuestCount} />
          <StatCard label="Repeat Guest Rate" value={`${g.repeatRatePct}%`} sub="Guest Portal + phone match" info="Best-effort — combines Guest Portal accounts with a same-phone-number heuristic. Not exact identity." />
          <StatCard label="Avg Guests / Booking" value={g.avgGuestsPerBooking || "—"} info="Only counts bookings where pax was actually logged." />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Top guests <span className="font-semibold text-[var(--gray)]">(by lifetime spend)</span></h3>
          {g.topGuests.length === 0 ? (
            <p className="text-[13px] text-[var(--gray)]">No identifiable repeat guests yet.</p>
          ) : (
            <div className="space-y-1.5">
              {g.topGuests.map((row) => (
                <div key={row.key} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold">{row.name} <span className="text-[var(--gray)]">· {row.bookingCount} booking{row.bookingCount === 1 ? "" : "s"}</span></span>
                  <span className="font-bold">{peso(Math.round(row.totalCentavos / 100))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Frequent guests <span className="font-semibold text-[var(--gray)]">(by visit count)</span></h3>
          {g.frequentGuests.length === 0 ? (
            <p className="text-[13px] text-[var(--gray)]">No identifiable repeat guests yet.</p>
          ) : (
            <div className="space-y-1.5">
              {g.frequentGuests.map((row) => (
                <div key={row.key} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold">{row.name}</span>
                  <span className="font-bold">{row.bookingCount} booking{row.bookingCount === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
