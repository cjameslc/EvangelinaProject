import { prisma } from "@/lib/prisma";

export type CouponCheck =
  | { ok: true; code: string; discountAmount: number }
  | { ok: false; error: string };

function computeDiscount(type: string, value: number, subtotal: number): number {
  if (type === "percent") return Math.round((subtotal * value) / 100);
  return Math.min(value, subtotal);
}

/**
 * Read-only preview — used by the coupon-check endpoint (guest typing a
 * code) and the guest bookings POST route's pre-check before it even opens
 * a transaction. Never mutates usedCount. A limited coupon can still only
 * ever be oversold-protected by the atomic claim inside
 * bookingService.ts's $transaction (see createBookingCore) — this function
 * alone is not safe against a race between two concurrent bookings.
 *
 * ownerId is required, not optional — was previously looked up by code
 * alone with no tenant check, so a guest booking with one tenant could
 * redeem a different tenant's coupon code. Both call sites resolve the
 * real owner from the unit being booked before calling this.
 */
export async function checkCoupon(codeRaw: string, subtotal: number, ownerId: string): Promise<CouponCheck> {
  const code = codeRaw.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };
  const coupon = await prisma.coupon.findFirst({ where: { code, ownerId } });
  if (!coupon || !coupon.active) return { ok: false, error: "That coupon code isn't valid." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) return { ok: false, error: "That coupon has expired." };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false, error: "That coupon has reached its usage limit." };
  return { ok: true, code: coupon.code, discountAmount: computeDiscount(coupon.type, coupon.value, subtotal) };
}
