import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";

/**
 * Two independent things this route does, kept separate rather than
 * overloaded into one shape: the original `redeemed` toggle (staff-redeemed
 * rewards like late checkout/coffee have no automated redemption trail like
 * the discount reward does — Coupon.usedCount — so this just lets Admin
 * mark one used in person), and the newer `action` field for public-review
 * moderation (approve/reject/feature/pin) — added for the guest-reviews
 * marquee on /book. Deliberately no "edit" action — rewriting what reads as
 * a guest's own words defeats the point of a *real, verified* review
 * section; reject/delete are the tools for a review that shouldn't be
 * shown, not rewriting it into something the guest didn't say.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  // Was missing — same audit sweep as Units/Users/Employees.
  const target = await prisma.feedbackResponse.findUnique({ where: { id: params.id }, select: { unitId: true } });
  if (!target) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  if (!await isUnitInScope(user, target.unitId)) return forbiddenUnitScopeResponse(user);

  const body = await req.json().catch(() => ({}));

  if (typeof body?.action === "string") {
    const data: Record<string, unknown> = {};
    let auditAction: string;
    switch (body.action) {
      case "approve": data.approved = true; auditAction = "feedback.approve"; break;
      case "reject": data.approved = false; auditAction = "feedback.reject"; break;
      case "feature": data.featured = true; auditAction = "feedback.feature"; break;
      case "unfeature": data.featured = false; auditAction = "feedback.unfeature"; break;
      case "pin": data.pinnedAt = new Date(); auditAction = "feedback.pin"; break;
      case "unpin": data.pinnedAt = null; auditAction = "feedback.unpin"; break;
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    const feedback = await prisma.feedbackResponse.update({ where: { id: params.id }, data }).catch(() => null);
    if (!feedback) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    await logAudit(user.id, auditAction, "FeedbackResponse", feedback.id, {});
    return NextResponse.json(feedback);
  }

  const redeemed = body?.redeemed !== false;
  const feedback = await prisma.feedbackResponse.update({
    where: { id: params.id },
    data: { redeemedAt: redeemed ? new Date() : null },
  });
  await logAudit(user.id, redeemed ? "feedback.redeem" : "feedback.unredeem", "FeedbackResponse", feedback.id, { voucherCode: feedback.voucherCode });
  return NextResponse.json(feedback);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const feedback = await prisma.feedbackResponse.findUnique({ where: { id: params.id }, select: { voucherCode: true, unitId: true } });
  if (!feedback) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  if (!await isUnitInScope(user, feedback.unitId)) return forbiddenUnitScopeResponse(user);

  await prisma.feedbackResponse.delete({ where: { id: params.id } });
  await logAudit(user.id, "feedback.delete", "FeedbackResponse", params.id, { voucherCode: feedback.voucherCode });
  return NextResponse.json({ ok: true });
}
