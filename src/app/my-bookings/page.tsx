import Link from "next/link";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestBookings } from "@/lib/bookingEngine/guestService";
import { isBookingCompleted } from "@/lib/bookingStatus";
import { peso, fmtDate } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";

function statusOf(b: { date: string; checkOutDate: string | null; cancelledAt: string | null }) {
  if (b.cancelledAt) return "cancelled";
  if (isBookingCompleted(b)) return "completed";
  if (new Date(b.date) <= new Date()) return "active";
  return "upcoming";
}

// Same rule as the booking detail page: a down-payment booking is a real,
// secured reservation once its down payment is confirmed, even though the
// remaining balance is still outstanding — not the same thing as "Paid."
function paymentLabel(b: { paid: boolean; paymentType: string; dpAmount: number | null }) {
  if (b.paid) return { text: "Paid", cls: "text-green" };
  if (b.paymentType === "down_payment" && b.dpAmount) return { text: "Confirmed", cls: "text-teal" };
  return { text: "Payment pending", cls: "text-amber" };
}

const STATUS_LABEL: Record<string, string> = { upcoming: "Upcoming", active: "Active", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLOR: Record<string, string> = { upcoming: "text-rausch bg-rausch/10", active: "text-teal bg-teal/10", completed: "text-[var(--gray)] bg-[var(--bg-2)]", cancelled: "text-amber bg-amber/10" };

export default async function MyBookingsPage({ searchParams }: { searchParams?: { welcome?: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <p className="mb-4 text-[15px] text-[var(--gray)]">Sign in to see your bookings.</p>
        <Link href="/guest-login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const bookings = await getGuestBookings(guest.id);
  const grouped: Record<string, typeof bookings> = { upcoming: [], active: [], completed: [], cancelled: [] };
  for (const b of bookings) grouped[statusOf(b as any)].push(b);

  return (
    <div className="mx-auto max-w-[700px] px-4 py-9 sm:px-6">
      {searchParams?.welcome === "1" && (
        <div className="mb-5 rounded-2xl bg-gradient-to-br from-rausch to-gold px-5 py-4 text-white shadow-card">
          <p className="text-[15.5px] font-extrabold">Welcome{guest.name ? `, ${guest.name}` : ""}! 🎉</p>
          <p className="mt-0.5 text-[13.5px] font-semibold text-white/90">Salamat for booking with us!</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">My bookings</h1>
          <p className="mt-1 text-[13.5px] text-[var(--gray)]">{guest.name ? `Welcome back, ${guest.name}` : `Signed in as ${guest.email}`}</p>
        </div>
        <Link href="/account" className="btn btn-sm">My account</Link>
      </div>

      {bookings.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-[14px] text-[var(--gray)]">No bookings yet.</p>
          <Link href="/" className="btn-primary mt-3 inline-flex">Browse listings</Link>
        </div>
      ) : (
        (["upcoming", "active", "completed", "cancelled"] as const).map((group) =>
          grouped[group].length === 0 ? null : (
            <div key={group} className="mt-7">
              <h2 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{STATUS_LABEL[group]} ({grouped[group].length})</h2>
              <div className="space-y-3">
                {grouped[group].map((b) => (
                  <Link key={b.id} href={`/my-bookings/${b.id}`} className="card block p-4 transition hover:border-[var(--ink)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold">{b.unit.shortName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase ${STATUS_COLOR[statusOf(b as any)]}`}>{STATUS_LABEL[statusOf(b as any)]}</span>
                    </div>
                    <div className="mt-1 text-[13px] text-[var(--gray)]">
                      {fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · {STAY_TYPES[b.stayType as keyof typeof STAY_TYPES]?.label ?? b.stayType}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[13.5px]">
                      <span className={`font-bold ${paymentLabel(b).cls}`}>{paymentLabel(b).text}</span>
                      <span className="font-extrabold">{peso(b.amount)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}
