import { prisma } from "@/lib/prisma";
import { isBookingCompleted } from "@/lib/bookingStatus";
import { isUniqueConstraintError } from "@/lib/apiValidation";
import { generateVoucherCode } from "@/lib/bookingEngine/voucherCode";
import { LIKED_TAGS, REWARD_OPTIONS, RECOMMEND_OPTIONS, type RewardKey, type RecommendKey } from "@/lib/feedbackContent";

export { LIKED_TAGS, REWARD_OPTIONS, RECOMMEND_OPTIONS, type RewardKey, type RecommendKey };

const VOUCHER_VALIDITY_DAYS = 90;
const DISCOUNT_REWARD_VALUE = 100;

export type FeedbackInput = {
  overallRating: number;
  likedTags: string[];
  improveComment: string | null;
  wouldRecommend: RecommendKey;
  rewardType: RewardKey;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
};

export async function getFeedbackForBooking(guestId: string, bookingId: string) {
  return prisma.feedbackResponse.findFirst({ where: { bookingId, guestId } });
}

/**
 * One feedback response per booking, enforced by FeedbackResponse.bookingId
 * being @unique — the findUnique check below is the friendly, race-free-
 * in-practice fast path (matches the same check-then-create style already
 * used by generateConfirmationNumber/generateVoucherCode elsewhere in this
 * file's neighborhood, no $transaction anywhere in this codebase), and the
 * try/catch on create() is the real backstop against a genuine race.
 */
export async function submitFeedback(
  guestId: string,
  bookingId: string,
  input: FeedbackInput
): Promise<{ ok: true; feedback: { voucherCode: string; voucherExpiresAt: Date; rewardType: string } } | { ok: false; error: string }> {
  if (!Number.isInteger(input.overallRating) || input.overallRating < 1 || input.overallRating > 5) {
    return { ok: false, error: "Invalid rating." };
  }
  if (!RECOMMEND_OPTIONS.some((r) => r.key === input.wouldRecommend)) return { ok: false, error: "Invalid recommendation answer." };
  if (!REWARD_OPTIONS.some((r) => r.key === input.rewardType)) return { ok: false, error: "Invalid reward selection." };
  if (!input.contactName.trim() || !input.contactPhone.trim()) return { ok: false, error: "Name and mobile number are required." };

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, guestId },
    select: { id: true, unitId: true, cancelledAt: true, date: true, checkOutDate: true },
  });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.cancelledAt) return { ok: false, error: "This booking was cancelled." };
  if (!isBookingCompleted(booking)) return { ok: false, error: "Feedback opens once your stay is complete." };

  const existing = await prisma.feedbackResponse.findUnique({ where: { bookingId }, select: { id: true } });
  if (existing) return { ok: false, error: "Feedback has already been submitted for this booking." };

  const voucherCode = await generateVoucherCode();
  const voucherExpiresAt = new Date(Date.now() + VOUCHER_VALIDITY_DAYS * 86400000);

  // The ₱100-off reward is a genuine, single-use Coupon a guest can apply
  // on their next booking — not just a decorative code (see the model
  // comment in schema.prisma for why this has no FK relation to Coupon).
  if (input.rewardType === "discount") {
    await prisma.coupon.create({
      data: {
        code: voucherCode,
        type: "fixed",
        value: DISCOUNT_REWARD_VALUE,
        maxUses: 1,
        expiresAt: voucherExpiresAt,
        active: true,
        description: `Guest feedback reward (booking ${bookingId})`,
      },
    });
  }

  try {
    const feedback = await prisma.feedbackResponse.create({
      data: {
        bookingId,
        guestId,
        unitId: booking.unitId,
        overallRating: input.overallRating,
        // See Booking.guests for the same pattern — likedTags is a JSON-
        // encoded TEXT column at the DB level (src/lib/prisma.ts's
        // json-string-fields extension stringifies it on write), so the
        // generated Prisma input type is `string`, not `string[]`.
        likedTags: input.likedTags as any,
        improveComment: input.improveComment?.trim() || null,
        wouldRecommend: input.wouldRecommend,
        rewardType: input.rewardType,
        voucherCode,
        voucherExpiresAt,
        contactName: input.contactName.trim(),
        contactPhone: input.contactPhone.trim(),
        contactEmail: input.contactEmail?.trim() || null,
      },
      select: { voucherCode: true, voucherExpiresAt: true, rewardType: true },
    });
    return { ok: true, feedback };
  } catch (e) {
    if (isUniqueConstraintError(e)) return { ok: false, error: "Feedback has already been submitted for this booking." };
    throw e;
  }
}

export async function getFeedbackList() {
  return prisma.feedbackResponse.findMany({
    orderBy: { createdAt: "desc" },
    include: { unit: { select: { id: true, name: true, shortName: true, unitNumber: true } } },
  });
}

export type FeedbackAnalytics = {
  count: number;
  averageRating: number;
  recommendBreakdown: Record<RecommendKey, number>;
  tagCounts: { key: string; label: string; count: number }[];
  rewardCounts: Record<RewardKey, number>;
};

export function computeFeedbackAnalytics(rows: { overallRating: number; wouldRecommend: string; likedTags: string[]; rewardType: string }[]): FeedbackAnalytics {
  const count = rows.length;
  const averageRating = count === 0 ? 0 : rows.reduce((sum, r) => sum + r.overallRating, 0) / count;

  const recommendBreakdown = { definitely: 0, probably: 0, maybe: 0, no: 0 } as Record<RecommendKey, number>;
  const rewardCounts = { discount: 0, late_checkout: 0, coffee: 0 } as Record<RewardKey, number>;
  const tagTally = new Map<string, number>();

  for (const r of rows) {
    if (r.wouldRecommend in recommendBreakdown) recommendBreakdown[r.wouldRecommend as RecommendKey]++;
    if (r.rewardType in rewardCounts) rewardCounts[r.rewardType as RewardKey]++;
    for (const tag of r.likedTags) tagTally.set(tag, (tagTally.get(tag) ?? 0) + 1);
  }

  const tagCounts = LIKED_TAGS.map((t) => ({ key: t.key, label: t.label, count: tagTally.get(t.key) ?? 0 })).sort((a, b) => b.count - a.count);

  return { count, averageRating, recommendBreakdown, tagCounts, rewardCounts };
}
