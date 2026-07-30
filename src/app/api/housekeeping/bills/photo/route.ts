import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";
import { uploadBillReceipt } from "@/lib/blob";

const MAX_SIZE = 4 * 1024 * 1024; // matches BillsPanel.tsx's existing client-side cap

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const billId = form.get("billId");
  if (!(file instanceof File) || typeof billId !== "string" || !billId) {
    return NextResponse.json({ error: "Missing file or billId" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File is too large (max 4MB)" }, { status: 400 });

  const url = await uploadBillReceipt(file, billId);
  return NextResponse.json({ url });
}
