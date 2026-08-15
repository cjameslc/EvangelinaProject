import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/ownerScope";
import { uploadOwnerLogo } from "@/lib/blob";

const MAX_SIZE = 4 * 1024 * 1024;

/** Uploads a new owner's icon during Platform Admin's Create Owner flow —
 * the Owner row doesn't exist yet at this point, so the returned URL is
 * just held in the form and sent along with the rest of the create payload
 * (createOwnerSchema.logoUrl), same two-step shape as every other
 * upload-then-attach flow in this app. */
export async function POST(req: NextRequest) {
  const { error } = await requirePlatformAdmin();
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

  const url = await uploadOwnerLogo(file);
  return NextResponse.json({ url });
}
