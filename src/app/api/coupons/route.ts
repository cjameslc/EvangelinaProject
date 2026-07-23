import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { couponSchema } from "@/lib/validation";
import { parseOrError, isUniqueConstraintError } from "@/lib/apiValidation";

export async function GET() {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(coupons);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const parsed = parseOrError(couponSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (body.type === "percent" && body.value > 100) {
    return NextResponse.json({ error: "A percent coupon can't exceed 100%." }, { status: 400 });
  }

  try {
    const coupon = await prisma.coupon.create({
      data: {
        code: body.code,
        type: body.type,
        value: body.value,
        maxUses: body.maxUses ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        active: body.active ?? true,
        description: body.description || null,
      },
    });
    await logAudit(user.id, "coupon.create", "Coupon", coupon.id, { code: coupon.code });
    return NextResponse.json(coupon, { status: 201 });
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That coupon code already exists." }, { status: 409 });
    throw e;
  }
}
