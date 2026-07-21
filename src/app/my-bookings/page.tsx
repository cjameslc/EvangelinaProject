import Link from "next/link";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestBookings } from "@/lib/bookingEngine/guestService";
import { peso, fmtDate } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";

// Functionally real (reads through the Booking Engine's guestService)
// but visually minimal — Phase D (Guest Portal) gives this the full
// Airbnb-inspired treatment: status grouping, invoices, cancel/modify.
export default async function MyBookingsPage() {
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

  return (
    <div className="mx-auto max-w-[700px] px-4 py-9 sm:px-6">
      <h1 className="text-[24px] font-extrabold tracking-tight">My bookings</h1>
      <p className="mt-1 text-[13.5px] text-[var(--gray)]">Signed in as {guest.email}</p>

      {bookings.length === 0 ? (
        <p className="mt-8 text-[14px] text-[var(--gray)]">No bookings yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">{b.unit.shortName}</span>
                <span className="text-[12px] font-bold text-[var(--gray)]">{STAY_TYPES[b.stayType as keyof typeof STAY_TYPES]?.label ?? b.stayType}</span>
              </div>
              <div className="mt-1 text-[13px] text-[var(--gray)]">{fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</div>
              <div className="mt-2 flex items-center justify-between text-[13.5px]">
                <span className={b.paid ? "font-bold text-green" : "font-bold text-amber"}>{b.paid ? "Paid" : "Payment pending"}</span>
                <span className="font-extrabold">{peso(b.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
