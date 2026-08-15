import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { uploadPaymentQr } from "@/lib/blob";

const MAX_SIZE = 4 * 1024 * 1024;

/** Uploads this owner's guest-payment QR code (GCash/bank scan-to-pay) to
 * Vercel Blob and returns its URL — same two-step shape as every other
 * settings image field (upload, then the client PATCHes the URL into
 * Settings.paymentQrUrl through the normal settings save). */
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!user.ownerId) return NextResponse.json({ error: "No tenant linked to this account." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image too large (max 4MB)" }, { status: 400 });
  }

  const url = await uploadPaymentQr(file, user.ownerId);
  return NextResponse.json({ url });
}
