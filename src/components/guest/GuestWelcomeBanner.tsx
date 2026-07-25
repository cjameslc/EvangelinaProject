"use client";

import { paymentLabel } from "@/lib/bookingStatus";
import { fmtDate, fmtTimeStr } from "@/lib/format";
import { pickTravelQuote } from "@/lib/unsplash/quotes";
import { useTrackUnsplashView } from "@/lib/unsplash/useImageTracking";
import type { UnsplashImage } from "@/lib/unsplash/types";

const UTM = "utm_source=evangelinas_staycation&utm_medium=referral";

type WelcomeBooking = {
  id: string;
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

function nightsBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
}

/**
 * Shown once, above the existing Guidebook header — never replaces or
 * rearranges anything already there (a stated constraint carried over from
 * the auth-UX pass: this is purely additive). All values come straight
 * from the validated booking the page already fetched server-side; nothing
 * here is hardcoded or guessed. heroImage comes from the "hero" Unsplash
 * cache category (server-fetched, see /my-bookings/[id]/page.tsx) — never
 * a live Unsplash call from this component.
 */
export function GuestWelcomeBanner({ booking, heroImage }: { booking: WelcomeBooking; heroImage?: UnsplashImage | null }) {
  const name = booking.guests[0] ?? "Guest";
  const status = paymentLabel(booking);
  const checkIn = new Date(booking.date);
  const checkOut = booking.checkOutDate ? new Date(booking.checkOutDate) : checkIn;
  const nights = nightsBetween(checkIn, checkOut);
  const quote = pickTravelQuote(booking.id);
  useTrackUnsplashView(heroImage);

  return (
    <div className="relative isolate overflow-hidden rounded-2xl text-white shadow-[0_20px_50px_-15px_rgba(0,0,0,.45)] animate-fade-up">
      {/* Background: real Unsplash image when cached, brand-gradient fallback otherwise — never a broken/empty hero either way. Slow Ken Burns drift for a premium, unhurried feel. */}
      <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-rausch via-[#c9294a] to-gold">
        {heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImage.regular} alt="" className="h-full w-full scale-110 object-cover animate-ken-burns" loading="eager" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />
      </div>

      <div className="relative p-5 sm:p-7">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/75">Welcome to Evangelina&rsquo;s Staycation</p>
        <p className="mt-1 text-[19px] font-extrabold tracking-tight sm:text-[24px]">👋 Welcome back, {name}!</p>
        <p className="mt-1 text-[12.5px] italic text-white/85">&ldquo;We&rsquo;re delighted to have you with us.&rdquo;</p>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-white/10 p-3.5 backdrop-blur-md sm:grid-cols-4 sm:p-4">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-white/65">Room</div>
            <div className="text-[14px] font-extrabold">Unit {booking.unit.unitNumber}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-white/65">Check-in</div>
            <div className="text-[14px] font-extrabold">{fmtDate(booking.date, { month: "short", day: "numeric", timeZone: "UTC" })}</div>
            <div className="text-[11px] text-white/75">{fmtTimeStr(booking.checkInTime) ?? "Time not set"}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-white/65">Check-out</div>
            <div className="text-[14px] font-extrabold">{booking.checkOutDate ? fmtDate(booking.checkOutDate, { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}</div>
            <div className="text-[11px] text-white/75">{fmtTimeStr(booking.checkOutTime) ?? "Time not set"}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-white/65">Stay duration</div>
            <div className="text-[14px] font-extrabold">{nights} night{nights === 1 ? "" : "s"}</div>
            <div className="text-[11px] text-white/75">{status.text}</div>
          </div>
        </div>

        <p className="mt-4 text-[11.5px] italic leading-relaxed text-white/80">
          &ldquo;{quote.text}&rdquo; <span className="not-italic text-white/60">— {quote.author}</span>
        </p>
      </div>

      {heroImage && (
        <div className="absolute bottom-2 right-2.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/80 backdrop-blur-sm">
          Photo by{" "}
          <a href={`${heroImage.photographerProfile}?${UTM}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
            {heroImage.photographer}
          </a>{" "}
          on{" "}
          <a href={`https://unsplash.com/?${UTM}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
            Unsplash
          </a>
        </div>
      )}
    </div>
  );
}
