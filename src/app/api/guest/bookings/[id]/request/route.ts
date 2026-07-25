import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { createGuestRequest } from "@/lib/bookingEngine/guestService";
import { uploadGuestRequestPhoto } from "@/lib/blob";
import { rateLimit } from "@/lib/rateLimit";

const MAX_SIZE = 8 * 1024 * 1024;

// Same real-image check as payment-proof's upload route — a client-supplied
// file.type is just a label, this checks actual magic bytes.
const MAGIC_BYTES: { sig: number[]; offset?: number }[] = [
  { sig: [0xff, 0xd8, 0xff] }, // JPEG
  { sig: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { sig: [0x47, 0x49, 0x46, 0x38] }, // GIF
  { sig: [0x52, 0x49, 0x46, 0x46] }, // WEBP (RIFF header)
];
async function looksLikeRealImage(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return MAGIC_BYTES.some(({ sig, offset = 0 }) => sig.every((b, i) => head[offset + i] === b));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  const limited = rateLimit(`guest-request:${guest.id}`, 15, 10 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  // Accepts both a plain JSON body (no photo — the common case, every
  // existing request type except a photo-bearing "issue" report) and
  // multipart form data (photo attached) — keeps the simple path simple,
  // only pays multipart's cost when there's actually a file.
  const contentType = req.headers.get("content-type") || "";
  let type = "", message: string | null = null, priority = "normal", photoUrl: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    type = typeof form.get("type") === "string" ? (form.get("type") as string) : "";
    const rawMessage = form.get("message");
    message = typeof rawMessage === "string" ? rawMessage.slice(0, 500) : null;
    const rawPriority = form.get("priority");
    priority = typeof rawPriority === "string" ? rawPriority : "normal";
    const file = form.get("photo");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Photo must be an image." }, { status: 400 });
      if (file.size > MAX_SIZE) return NextResponse.json({ error: "Photo too large (max 8MB)." }, { status: 400 });
      if (!(await looksLikeRealImage(file))) return NextResponse.json({ error: "That file doesn't look like a valid image." }, { status: 400 });
      photoUrl = await uploadGuestRequestPhoto(file, params.id);
    }
  } else {
    const body = await req.json().catch(() => ({}));
    type = typeof body?.type === "string" ? body.type : "";
    message = typeof body?.message === "string" ? body.message.slice(0, 500) : null;
    priority = typeof body?.priority === "string" ? body.priority : "normal";
  }

  const result = await createGuestRequest(guest.id, params.id, type, message, photoUrl, priority);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
