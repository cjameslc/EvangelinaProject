import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { hasActionAccess } from "@/lib/actionAccess";
import { uploadBillReceipt } from "@/lib/blob";

const MAX_SIZE = 4 * 1024 * 1024; // matches BillsPanel.tsx's existing client-side cap

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const billId = form.get("billId");
  if (!(file instanceof File) || typeof billId !== "string" || !billId) {
    return NextResponse.json({ error: "Missing file or billId" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File is too large (max 4MB)" }, { status: 400 });

  // Same real ownerId check as bills/[id] now uses — covers a site-wide
  // bill (null unitId) too, not just unit-tied ones.
  const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { unitId: true, ownerId: true } });
  if (!bill || bill.ownerId !== user.ownerId) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  if (bill.unitId && !await isUnitInScope(user, bill.unitId)) return forbiddenUnitScopeResponse(user);

  const url = await uploadBillReceipt(file, billId);
  return NextResponse.json({ url });
}
