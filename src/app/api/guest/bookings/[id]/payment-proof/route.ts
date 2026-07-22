import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { setGuestPaymentProof } from "@/lib/bookingEngine/guestService";
import { uploadGuestPaymentProof } from "@/lib/blob";

const MAX_SIZE = 8 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const field = form.get("field") === "dpProofUrl" ? "dpProofUrl" : "proofUrl";
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Image too large (max 8MB)." }, { status: 400 });

  const url = await uploadGuestPaymentProof(file, params.id);
  const result = await setGuestPaymentProof(guest.id, params.id, field, url);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, url });
}
