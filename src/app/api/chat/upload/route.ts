import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { requireMembership } from "@/lib/chat/service";
import { uploadChatImage } from "@/lib/blob";
import { rateLimit } from "@/lib/rateLimit";

const MAX_SIZE = 8 * 1024 * 1024;

// Same magic-bytes check as the guest payment-proof upload — a client
// file.type is just a label, never trusted alone.
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

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const limited = rateLimit(`chat-upload:${user.id}`, 20, 10 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many uploads — please wait a bit and try again." }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  const conversationId = form.get("conversationId");
  if (typeof conversationId !== "string" || !conversationId) return NextResponse.json({ error: "Missing conversationId." }, { status: 400 });
  if (!(await requireMembership(conversationId, user.id))) return new Response("Forbidden", { status: 403 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Image too large (max 8MB)." }, { status: 400 });
  if (!(await looksLikeRealImage(file))) return NextResponse.json({ error: "That file doesn't look like a valid image." }, { status: 400 });

  const url = await uploadChatImage(file, conversationId);
  return NextResponse.json({ url });
}
