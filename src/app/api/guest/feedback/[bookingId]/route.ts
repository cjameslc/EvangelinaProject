import { NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { getFeedbackForBooking } from "@/lib/bookingEngine/feedbackService";

/** Lets the feedback page (and the "already submitted" recap) check
 * whether this booking has feedback yet without re-deriving it from the
 * booking-detail fetch. */
export async function GET(_req: Request, { params }: { params: { bookingId: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  const feedback = await getFeedbackForBooking(guest.id, params.bookingId);
  return NextResponse.json({ feedback });
}
