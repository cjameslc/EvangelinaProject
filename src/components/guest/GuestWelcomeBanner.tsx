import { paymentLabel } from "@/lib/bookingStatus";
import { fmtDate, fmtTimeStr } from "@/lib/format";

type WelcomeBooking = {
  guests: string[];
  unit: { unitNumber: string };
  date: string;
  checkOutDate: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  paid: boolean;
  paymentType: string;
  dpAmount: number | null;
};

/**
 * Shown once, above the existing Guidebook header — never replaces or
 * rearranges anything already there (a stated constraint: this is purely
 * additive). All values come straight from the validated booking the page
 * already fetched server-side; nothing here is hardcoded or guessed.
 */
export function GuestWelcomeBanner({ booking }: { booking: WelcomeBooking }) {
  const name = booking.guests[0] ?? "Guest";
  const status = paymentLabel(booking);

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-rausch to-gold text-white">
      <div className="p-5">
        <p className="text-[16px] font-extrabold">👋 Welcome, {name}!</p>
        <p className="mt-1 text-[12.5px] text-white/90">
          Welcome to Evangelina&rsquo;s Staycation! We&rsquo;re excited to host you and hope you have a wonderful stay.
        </p>
        <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-white/25 pt-3.5 sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Room</div>
            <div className="text-[13.5px] font-extrabold">Unit {booking.unit.unitNumber}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Check-in</div>
            <div className="text-[13.5px] font-extrabold">{fmtDate(booking.date, { month: "short", day: "numeric", timeZone: "UTC" })}</div>
            <div className="text-[11px] text-white/80">{fmtTimeStr(booking.checkInTime) ?? "Time not set"}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Check-out</div>
            <div className="text-[13.5px] font-extrabold">{booking.checkOutDate ? fmtDate(booking.checkOutDate, { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}</div>
            <div className="text-[11px] text-white/80">{fmtTimeStr(booking.checkOutTime) ?? "Time not set"}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Status</div>
            <div className="text-[13.5px] font-extrabold">{status.text}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
