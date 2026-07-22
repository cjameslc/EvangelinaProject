import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestBookingForGuide } from "@/lib/bookingEngine/guestService";
import { getGuidebookSettings } from "@/lib/guidebookService";
import { GuidebookView } from "@/components/guest/GuidebookView";

export default async function GuidebookPage({ params }: { params: { id: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <p className="mb-4 text-[15px] text-[var(--gray)]">Sign in to see your Digital Guidebook.</p>
        <Link href="/guest-login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const [booking, guidebook] = await Promise.all([
    getGuestBookingForGuide(guest.id, params.id),
    getGuidebookSettings(),
  ]);
  if (!booking) notFound();

  return <GuidebookView booking={JSON.parse(JSON.stringify(booking))} guidebook={guidebook} />;
}
