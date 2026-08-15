import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCoupon } from "@/lib/bookingEngine/couponService";
import { splitDownPayment } from "@/lib/pricing/rates";
import { getCachedBookingSettings } from "@/lib/bookingEngine/settingsCache";
import { getDefaultOwnerId } from "@/lib/ownerScope";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Public — called from the booking flow before the guest is signed in, same
// as booking-quote. Rate-limited by IP since it's an unauthenticated
// code-guessing surface (a limited/percent coupon is worth probing for).
export async function GET(req: NextRequest) {
  const limited = rateLimit(`coupon-check:${clientIp(req)}`, 20, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Please wait a bit and try again." }, { status: 429 });

  const code = req.nextUrl.searchParams.get("code");
  const subtotalRaw = req.nextUrl.searchParams.get("subtotal");
  const subtotal = subtotalRaw !== null ? Number(subtotalRaw) : NaN;
  const unitId = req.nextUrl.searchParams.get("unitId");
  if (!code || !Number.isFinite(subtotal) || subtotal < 0) {
    return NextResponse.json({ error: "A code and subtotal are required." }, { status: 400 });
  }

  // The unit the guest already selected tells us the real owner — was
  // previously resolved via getDefaultOwnerId() unconditionally, which is
  // exactly the class of session-less fallback that's safe for a
  // never-actually-owner-specific config read but not for scoping a coupon
  // redemption. Falls back to getDefaultOwnerId() only if a unitId truly
  // wasn't sent (defensive — the frontend always sends one once a unit is
  // selected, which is required before the coupon field is even shown).
  const unit = unitId ? await prisma.unit.findUnique({ where: { id: unitId }, select: { ownerId: true } }) : null;
  const ownerId = unit?.ownerId ?? (await getDefaultOwnerId())!;

  const check = await checkCoupon(code, subtotal, ownerId);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error });

  const settings = await getCachedBookingSettings(ownerId);
  const total = subtotal - check.discountAmount;
  const { dpAmount, balanceDue } = splitDownPayment(total, settings.dpFee);

  return NextResponse.json({ ok: true, code: check.code, discountAmount: check.discountAmount, total, dpAmount, balanceDue });
}
