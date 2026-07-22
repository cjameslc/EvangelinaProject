import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { markNotificationsRead } from "@/lib/bookingEngine/guestService";

export async function POST(req: NextRequest) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  await markNotificationsRead(guest.id, Array.isArray(body.ids) ? body.ids : undefined);
  return NextResponse.json({ ok: true });
}
