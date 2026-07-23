import { getCurrentGuest } from "@/lib/guestSession";
import { getActiveGuideBooking } from "@/lib/bookingEngine/guestService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { SecureDoorCodeCard, NoActiveStayNotice } from "@/components/guest/SecureGuideCards";
import { CHECKIN_STEPS } from "@/lib/guidebookContent";
import { GALLERY } from "@/lib/galleryContent";

export default async function CheckInPage() {
  const guest = await getCurrentGuest();
  const booking = guest ? await getActiveGuideBooking(guest.id) : null;
  const hasCode = !!booking?.unit.doorCode;

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader
        image={GALLERY.checkin[0].src}
        icon="🔑"
        title="Check-In Guide"
        subtitle={hasCode ? `Here's how to get into ${booking!.unit.name}.` : "Here's how self check-in works for every unit."}
      />

      <div className="card mt-3 divide-y divide-[var(--line)] p-0">
        {CHECKIN_STEPS.map((step) => (
          <div key={step.step} className="flex gap-3 p-4">
            <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-rausch/10 text-[13px] font-extrabold text-rausch">{step.step}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold">{step.title}</div>
              {step.body.map((line, i) => (
                <p key={i} className="mt-0.5 text-[13px] leading-relaxed text-[var(--gray)]">{line}</p>
              ))}
              {step.step === CHECKIN_STEPS.length && (
                <div className="mt-3">
                  {hasCode ? <SecureDoorCodeCard doorCode={booking!.unit.doorCode!} /> : <NoActiveStayNotice what="your unit's door code" signedIn={!!guest} />}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {booking?.unit.checkInInstructions && (
        <div className="card mt-3 p-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Additional notes</div>
          <p className="text-[13.5px] leading-relaxed">{booking.unit.checkInInstructions}</p>
        </div>
      )}
      {booking?.unit.videoTutorialUrl && (
        <a href={booking.unit.videoTutorialUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[13px] font-bold text-rausch hover:underline">
          ▶ Watch the check-in video
        </a>
      )}
    </div>
  );
}
