import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { createGuestRequest } from "@/lib/bookingEngine/guestService";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  const limited = rateLimit(`guest-request:${guest.id}`, 15, 10 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const type = typeof body?.type === "string" ? body.type : "";
  const message = typeof body?.message === "string" ? body.message.slice(0, 500) : null;

  const result = await createGuestRequest(guest.id, params.id, type, message);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
