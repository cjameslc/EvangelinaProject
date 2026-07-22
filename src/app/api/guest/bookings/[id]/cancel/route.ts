import { NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { cancelGuestBooking } from "@/lib/bookingEngine/guestService";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  const result = await cancelGuestBooking(guest.id, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
