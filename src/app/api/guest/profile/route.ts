import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { updateGuestProfile } from "@/lib/bookingEngine/guestService";

export async function PATCH(req: NextRequest) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; phone?: string; emailNotifications?: boolean } = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.phone === "string") data.phone = body.phone.trim();
  if (typeof body.emailNotifications === "boolean") data.emailNotifications = body.emailNotifications;

  const updated = await updateGuestProfile(guest.id, data);
  return NextResponse.json({ ok: true, guest: updated });
}
