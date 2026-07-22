import { NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { getUnreadNotificationCount } from "@/lib/bookingEngine/guestService";

export async function GET() {
  const guest = await getCurrentGuest();
  if (!guest) return NextResponse.json({ count: 0 });
  const count = await getUnreadNotificationCount(guest.id);
  return NextResponse.json({ count });
}
