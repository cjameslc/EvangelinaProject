import { TransitionLink } from "@/components/guest/TransitionLink";
import { getGuidebookSettingsForCurrentGuest } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { MeetYourHostSection, MeetOurTeamSection } from "@/components/guest/GuidebookSections";
import { telUrl } from "@/lib/guideUtils";
import { GALLERY } from "@/lib/galleryContent";

export default async function WelcomePage() {
  const guidebook = await getGuidebookSettingsForCurrentGuest();

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader
        image={GALLERY.hero[0].src}
        icon="🏠"
        title="Welcome to Evangelina's Staycation"
        subtitle="Cubao, Quezon City — thoughtfully designed studio units for day stays, overnight escapes, and 21-hour retreats."
      />

      <div className="card mt-3 grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-3">
        <TransitionLink href="/book" className="btn-primary justify-center">📅 Book Now</TransitionLink>
        <TransitionLink href="/my-bookings" className="btn justify-center">🧾 My Booking</TransitionLink>
        {guidebook.contactPhone ? (
          <a href={telUrl(guidebook.contactPhone)} className="btn justify-center">📞 Contact Host</a>
        ) : (
          <TransitionLink href="/guide/contact" className="btn justify-center">📞 Contact Host</TransitionLink>
        )}
      </div>

      <div className="mt-3">
        <MeetYourHostSection hostName={guidebook.hostName} hostPhotoUrl={guidebook.hostPhotoUrl} hostBio={guidebook.hostBio} />
      </div>
      <div className="mt-3">
        <MeetOurTeamSection team={guidebook.team} />
      </div>

      <div className="card mt-3 p-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">A peek inside</div>
        <div className="grid grid-cols-3 gap-2">
          {[...GALLERY["living-room"].slice(0, 1), ...GALLERY.bedroom.slice(0, 1), ...GALLERY.bathroom.slice(0, 1)].map((img) => (
            <div key={img.src} className="aspect-square overflow-hidden rounded-xl bg-[var(--bg-2)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={img.alt} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
        <TransitionLink href="/guide/gallery" className="mt-3 inline-block text-[13px] font-bold text-rausch hover:underline">See the full gallery →</TransitionLink>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <TransitionLink href="/guide/house-manual" className="card p-4 text-center hover:bg-[var(--bg-2)]">
          <div className="text-[20px]">📖</div>
          <div className="mt-1 text-[13px] font-bold">House Manual</div>
        </TransitionLink>
        <TransitionLink href="/guide/faqs" className="card p-4 text-center hover:bg-[var(--bg-2)]">
          <div className="text-[20px]">❓</div>
          <div className="mt-1 text-[13px] font-bold">FAQs</div>
        </TransitionLink>
      </div>
    </div>
  );
}
