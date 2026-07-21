import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";
import { uploadHousekeepingPhoto } from "@/lib/blob";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB — generous for a phone camera photo, still bounded

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const unitId = form.get("unitId");
  if (!(file instanceof File) || typeof unitId !== "string" || !unitId) {
    return NextResponse.json({ error: "Missing file or unitId" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
  }

  const url = await uploadHousekeepingPhoto(file, unitId);
  return NextResponse.json({ url });
}
