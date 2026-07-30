import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { uploadUserAvatar } from "@/lib/blob";

const MAX_SIZE = 3 * 1024 * 1024; // matches ProfileView.tsx's client-side cap

// Self-service only, same as PATCH /api/profile — just returns the
// uploaded photo's real URL; the caller still PATCHes /api/profile with it
// to actually save it against their own account.
export async function POST(req: NextRequest) {
  const { error } = await requireUser();
  if (error) return error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Please choose an image file" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Photo is too large — the limit is 3MB" }, { status: 400 });

  const url = await uploadUserAvatar(file);
  return NextResponse.json({ url });
}
