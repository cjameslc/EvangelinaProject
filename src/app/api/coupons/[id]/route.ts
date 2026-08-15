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
    // Tenant-scoped fetch before the update, restricted to the fields this
    // edit actually touches — the audit trail's before-snapshot.
    const priorCoupon = await prisma.coupon.findFirst({ where: { id: params.id, ownerId: user.ownerId } });
    const before: Record<string, unknown> = {};
    if (priorCoupon) for (const k of Object.keys(body)) if (k in priorCoupon) before[k] = (priorCoupon as any)[k];

    // updateMany + ownerId in the where, not a plain update(where:{id}) —
    // the write-path tenant check (same principle as isUnitInScope in
    // session.ts): without this, any owner's admin could edit another
    // owner's coupon just by knowing/guessing its id.
    const result = await prisma.coupon.updateMany({
      where: { id: params.id, ownerId: user.ownerId },
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
    if (result.count === 0) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    const coupon = await prisma.coupon.findUnique({ where: { id: params.id } });
    await logAudit(user.id, "coupon.update", "Coupon", params.id, { before, after: body });
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
  const priorCoupon = await prisma.coupon.findFirst({ where: { id: params.id, ownerId: user.ownerId } });
  const result = await prisma.coupon.deleteMany({ where: { id: params.id, ownerId: user.ownerId } });
  if (result.count === 0) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
  await logAudit(user.id, "coupon.delete", "Coupon", params.id, { before: priorCoupon });
  return NextResponse.json({ ok: true });
}
