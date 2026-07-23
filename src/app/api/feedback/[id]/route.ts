import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";

/** Staff-redeemed rewards (late checkout, coffee) have no automated
 * redemption trail like the discount reward does (that one's tracked via
 * Coupon.usedCount) — this just lets Admin mark/unmark one used in person. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const redeemed = body?.redeemed !== false;

  const feedback = await prisma.feedbackResponse.update({
    where: { id: params.id },
    data: { redeemedAt: redeemed ? new Date() : null },
  });
  await logAudit(user.id, redeemed ? "feedback.redeem" : "feedback.unredeem", "FeedbackResponse", feedback.id, { voucherCode: feedback.voucherCode });
  return NextResponse.json(feedback);
}
