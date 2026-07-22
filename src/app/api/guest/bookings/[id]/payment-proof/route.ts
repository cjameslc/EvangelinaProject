import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { verifyGuestPaymentProof } from "@/lib/bookingEngine/guestService";
import { uploadGuestPaymentProof } from "@/lib/blob";
import { rateLimit } from "@/lib/rateLimit";

const MAX_SIZE = 8 * 1024 * 1024;

// Client-supplied file.type is just a label — check real magic bytes for
// the formats a payment-screenshot upload could plausibly be, so a
// mislabeled non-image can't ride in as "image/png".
const MAGIC_BYTES: { sig: number[]; offset?: number }[] = [
  { sig: [0xff, 0xd8, 0xff] }, // JPEG
  { sig: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { sig: [0x47, 0x49, 0x46, 0x38] }, // GIF
  { sig: [0x52, 0x49, 0x46, 0x46] }, // WEBP (RIFF header; "WEBP" follows at offset 8, good enough here)
];

async function looksLikeRealImage(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return MAGIC_BYTES.some(({ sig, offset = 0 }) => sig.every((b, i) => head[offset + i] === b));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  // Each upload now triggers a real Gemini vision call — worth protecting
  // against a client hammering this loop, same pattern as the AI Assistant
  // route (src/app/api/guest/assistant/route.ts).
  const limited = rateLimit(`payment-proof:${guest.id}`, 10, 10 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many uploads — please wait a bit and try again." }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  const field = form.get("field") === "dpProofUrl" ? "dpProofUrl" : "proofUrl";
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Image too large (max 8MB)." }, { status: 400 });
  if (!(await looksLikeRealImage(file))) return NextResponse.json({ error: "That file doesn't look like a valid image." }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const url = await uploadGuestPaymentProof(file, params.id);
  const result = await verifyGuestPaymentProof(guest.id, params.id, field, url, base64, file.type);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, url, status: result.status, note: result.note });
}
