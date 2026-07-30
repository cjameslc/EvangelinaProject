import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { uploadExpenseReceipt } from "@/lib/blob";

const MAX_SIZE = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { error } = await requireUser();
  if (error) return error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File is too large (max 4MB)" }, { status: 400 });

  const url = await uploadExpenseReceipt(file);
  return NextResponse.json({ url });
}
