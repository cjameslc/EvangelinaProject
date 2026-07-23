import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { couponSchema } from "@/lib/validation";
import { parseOrError, isUniqueConstraintError } from "@/lib/apiValidation";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const parsed = parseOrError(couponSchema.partial(), await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (body.type === "percent" && body.value !== undefined && body.value > 100) {
    return NextResponse.json({ error: "A percent coupon can't exceed 100%." }, { status: 400 });
  }

  try {
    const coupon = await prisma.coupon.update({
      where: { id: params.id },
      data: {
        ...(body.code !== undefined && { code: body.code }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.value !== undefined && { value: body.value }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses }),
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.description !== undefined && { description: body.description || null }),
      },
    });
    await logAudit(user.id, "coupon.update", "Coupon", coupon.id, { code: coupon.code });
    return NextResponse.json(coupon);
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That coupon code already exists." }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  // No FK from Booking — couponCode/couponDiscountAmount are a denormalized
  // snapshot there (see schema.prisma), so deleting a Coupon never touches
  // historical bookings that used it.
  await prisma.coupon.delete({ where: { id: params.id } });
  await logAudit(user.id, "coupon.delete", "Coupon", params.id);
  return NextResponse.json({ ok: true });
}
