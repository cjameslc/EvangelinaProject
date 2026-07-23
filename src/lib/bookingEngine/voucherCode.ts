import { prisma } from "@/lib/prisma";

// Same visually-unambiguous alphabet as generateConfirmationNumber (no
// 0/O, 1/I/L) — this code gets read aloud/typed by hand too, at checkout
// or when a staff member redeems it in person.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** "GIFT-7K2M9X" style code, collision-checked against both tables it could
 * ever land in — feedback_responses always, and coupons too when the
 * reward is the ₱-off discount (see submitFeedback in feedbackService.ts,
 * which reuses this same code as the real Coupon.code so the voucher is
 * genuinely usable at the next booking, not just decorative). */
export async function generateVoucherCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `GIFT-${randomCode(6)}`;
    const [existingFeedback, existingCoupon] = await Promise.all([
      prisma.feedbackResponse.findUnique({ where: { voucherCode: code }, select: { id: true } }),
      prisma.coupon.findUnique({ where: { code }, select: { id: true } }),
    ]);
    if (!existingFeedback && !existingCoupon) return code;
  }
  throw new Error("Could not generate a unique voucher code.");
}
