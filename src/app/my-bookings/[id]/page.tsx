import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestBookingForGuide } from "@/lib/bookingEngine/guestService";
import { getGuidebookSettings } from "@/lib/guidebookService";
import { getPlaceInsightsByNames } from "@/lib/places/placeInsightService";
import { GuestBookingHub } from "@/components/guest/GuestBookingHub";

export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <p className="mb-4 text-[15px] text-[var(--gray)]">Sign in to see this booking.</p>
        <Link href="/guest-login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const [booking, guidebook] = await Promise.all([
    getGuestBookingForGuide(guest.id, params.id),
    getGuidebookSettings(),
  ]);
  if (!booking) notFound();

  const insightRows = await getPlaceInsightsByNames(guidebook.categories.flatMap((c) => c.items));
  const placeInsights = Object.fromEntries(insightRows);

  // The door code itself never reaches the client here — only whether one
  // exists — so re-entering the booking ID (see SecureDoorCodeCard /
  // /api/guest/door-code) is a real gate, not just a hidden-in-the-DOM one.
  const sanitizedBooking = { ...booking, unit: { ...booking.unit, doorCode: null, hasDoorCode: !!booking.unit.doorCode } };

  return (
    <GuestBookingHub
      booking={JSON.parse(JSON.stringify(sanitizedBooking))}
      guidebook={{ ...guidebook, placeInsights: JSON.parse(JSON.stringify(placeInsights)) }}
    />
  );
}
