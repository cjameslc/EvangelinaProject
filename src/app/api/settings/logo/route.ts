import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { uploadBrandLogo } from "@/lib/blob";

const MAX_SIZE = 4 * 1024 * 1024; // 4MB — a logo is a small, mostly-static asset, no need for the 8MB phone-photo cap

/** Uploads a Brand Kit logo to Vercel Blob and returns its URL — the client
 * then PATCHes that URL into Settings.logoUrl through the normal settings
 * save, same two-step shape as SettingsTab.tsx's existing host-photo flow. */
export async function POST(req: NextRequest) {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

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

  const url = await uploadBrandLogo(file);
  return NextResponse.json({ url });
}
