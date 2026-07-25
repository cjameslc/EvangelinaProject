import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestBookings } from "@/lib/bookingEngine/guestService";
import { guestJourneyStage, paymentLabel } from "@/lib/bookingStatus";
import { peso, fmtDate } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { InfoIcon, ArrowRightIcon } from "@/components/ui/Icons";

// This page's grouping is coarser than the full 5-stage guest journey
// (before_stay/check_in_day/during_stay/checkout_day/completed/cancelled,
// see bookingStatus.ts) — check-in day through checkout day all read as one
// "Active" bucket here, since this list view is about "which of my
// bookings needs attention," not the detailed stepper GuidebookView shows.
function statusOf(b: { date: string; checkOutDate: string | null; checkedInAt?: string | null; checkedOutAt?: string | null; cancelledAt: string | null }) {
  const stage = guestJourneyStage(b);
  if (stage === "cancelled") return "cancelled";
  if (stage === "completed") return "completed";
  if (stage === "before_stay") return "upcoming";
  return "active"; // check_in_day | during_stay | checkout_day
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

  // A single booking has nothing to pick between, so skip straight to its
  // details — except right after checkout (`welcome=1`), where the guest
  // should still see the welcome banner on this page first.
  if (bookings.length === 1 && searchParams?.welcome !== "1") {
    redirect(`/my-bookings/${bookings[0].id}`);
  }

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
          <p className="text-[15px] font-bold">No bookings yet</p>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[13.5px] text-[var(--gray)]">
            Once you book a stay with us, it'll show up here — tap it any time for your room number, digital door
            access, WiFi, and everything else you need for your trip.
          </p>
          <Link href="/" className="btn-primary mt-4 inline-flex">Browse listings</Link>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-rausch" />
            <p className="text-[12.5px] leading-relaxed text-[var(--gray)]">
              <span className="font-bold text-[var(--ink)]">Tap any booking below</span> to see your room number,
              check-in/out details, digital door access, WiFi, house rules, parking, nearby places, check-in/out
              guides, booking status, and how to reach your host.
            </p>
          </div>

          {(["upcoming", "active", "completed", "cancelled"] as const).map((group) =>
            grouped[group].length === 0 ? null : (
              <div key={group} className="mt-7">
                <h2 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--gray)]">{STATUS_LABEL[group]} ({grouped[group].length})</h2>
                <div className="space-y-3">
                  {grouped[group].map((b) => (
                    <Link
                      key={b.id}
                      href={`/my-bookings/${b.id}`}
                      className="card group block p-4 transition hover:border-[var(--ink)] hover:shadow-card active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold">{b.unit.shortName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase ${STATUS_COLOR[statusOf(b as any)]}`}>{STATUS_LABEL[statusOf(b as any)]}</span>
                      </div>
                      <div className="mt-1 text-[13px] text-[var(--gray)]">
                        {fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · {STAY_TYPES[b.stayType as keyof typeof STAY_TYPES]?.label ?? b.stayType}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[13.5px]">
                        <span className={`font-bold ${paymentLabel(b).cls}`}>{paymentLabel(b).text}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold">{peso(b.amount)}</span>
                          <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--gray)] transition group-hover:translate-x-0.5 group-hover:text-[var(--ink)]" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
