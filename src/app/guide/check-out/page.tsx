import { getCurrentGuest } from "@/lib/guestSession";
import { getActiveGuideBooking } from "@/lib/bookingEngine/guestService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { CheckoutChecklist } from "@/components/guest/CheckoutChecklist";
import { CHECKOUT_CHECKLIST } from "@/lib/guidebookContent";
import { fmtDate, fmtTimeStr } from "@/lib/format";
import { GALLERY } from "@/lib/galleryContent";

export default async function CheckOutPage() {
  const guest = await getCurrentGuest();
  const booking = guest ? await getActiveGuideBooking(guest.id) : null;

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader image={GALLERY.bathroom[0].src} icon="✅" title="Checkout Guide" subtitle="A few quick steps before you head out." />

      {booking?.checkOutDate && (
        <div className="card mt-3 p-5">
          <div className="text-[11px] font-bold text-[var(--gray)]">Your check-out</div>
          <div className="text-[16px] font-extrabold">{fmtDate(booking.checkOutDate, { month: "short", day: "numeric", timeZone: "UTC" })}</div>
          <div className="text-[12.5px] text-[var(--gray)]">{fmtTimeStr(booking.checkOutTime) ?? "Time not set"}</div>
        </div>
      )}

      <div className="card mt-3 p-5">
        <CheckoutChecklist items={CHECKOUT_CHECKLIST} />
      </div>

      {booking?.unit.checkOutInstructions && (
        <div className="card mt-3 p-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Additional notes</div>
          <p className="text-[13.5px] leading-relaxed">{booking.unit.checkOutInstructions}</p>
        </div>
      )}
    </div>
  );
}
