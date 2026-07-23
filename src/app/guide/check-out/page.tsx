import { getCurrentGuest } from "@/lib/guestSession";
import { getActiveGuideBooking } from "@/lib/bookingEngine/guestService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { CheckoutChecklist } from "@/components/guest/CheckoutChecklist";
import { CHECKOUT_CHECKLIST, CHECKOUT_THANK_YOU } from "@/lib/guidebookContent";
import { GALLERY } from "@/lib/galleryContent";

export default async function CheckOutPage() {
  const guest = await getCurrentGuest();
  const booking = guest ? await getActiveGuideBooking(guest.id) : null;

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader image={GALLERY.bathroom[0].src} icon="✅" title="Checkout Guide" subtitle="A few quick steps before you head out." />

      <div className="card mt-3 p-5">
        <CheckoutChecklist items={CHECKOUT_CHECKLIST} />
      </div>

      {booking?.unit.checkOutInstructions && (
        <div className="card mt-3 p-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Additional notes</div>
          <p className="text-[13.5px] leading-relaxed">{booking.unit.checkOutInstructions}</p>
        </div>
      )}

      <div className="card mt-3 p-5 text-center">
        <div className="text-[28px]">💙</div>
        <h2 className="mt-2 text-[16px] font-extrabold">{CHECKOUT_THANK_YOU.heading}</h2>
        <div className="mx-auto mt-3 max-w-[520px] space-y-3 text-left text-[13px] leading-relaxed text-[var(--gray)]">
          {CHECKOUT_THANK_YOU.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <p className="mx-auto mt-3 max-w-[520px] text-left text-[13px] font-bold leading-relaxed">{CHECKOUT_THANK_YOU.closing}</p>
        <p className="mt-4 text-[13px] text-[var(--gray)]">{CHECKOUT_THANK_YOU.signOff}</p>
        <p className="text-[13px] font-extrabold">{CHECKOUT_THANK_YOU.signature} 💙</p>
      </div>
    </div>
  );
}
