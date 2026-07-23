import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestBookingForGuide } from "@/lib/bookingEngine/guestService";
import { getFeedbackForBooking } from "@/lib/bookingEngine/feedbackService";
import { isBookingCompleted } from "@/lib/bookingStatus";
import { FeedbackFormView } from "@/components/guest/FeedbackFormView";

export default async function FeedbackPage({ params }: { params: { bookingId: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-14 text-center">
        <p className="mb-4 text-[15px] text-[var(--gray)]">Sign in to leave feedback for your stay.</p>
        <Link href="/guest-login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const booking = await getGuestBookingForGuide(guest.id, params.bookingId);
  if (!booking) notFound();

  if (booking.cancelledAt) {
    return <div className="mx-auto max-w-[480px] px-4 py-14 text-center text-[14px] text-[var(--gray)]">This booking was cancelled.</div>;
  }
  if (!isBookingCompleted(booking)) {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-14 text-center">
        <div className="text-4xl">⏳</div>
        <p className="mt-3 text-[14px] text-[var(--gray)]">Feedback opens once your stay is complete — we&rsquo;ll be here when you&rsquo;re done!</p>
      </div>
    );
  }

  const existing = await getFeedbackForBooking(guest.id, params.bookingId);

  return (
    <FeedbackFormView
      bookingId={booking.id}
      unitName={booking.unit.name}
      existingVoucher={existing ? { voucherCode: existing.voucherCode, voucherExpiresAt: existing.voucherExpiresAt.toISOString(), rewardType: existing.rewardType } : null}
    />
  );
}
