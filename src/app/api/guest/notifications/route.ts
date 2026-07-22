import { NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestNotifications } from "@/lib/bookingEngine/guestService";

export async function GET() {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });
  const notifications = await getGuestNotifications(guest.id);
  return NextResponse.json({ notifications });
}
