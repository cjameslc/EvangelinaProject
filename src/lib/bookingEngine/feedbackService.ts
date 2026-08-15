import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isBookingCompleted } from "@/lib/bookingStatus";
import { isUniqueConstraintError } from "@/lib/apiValidation";
import { generateVoucherCode } from "@/lib/bookingEngine/voucherCode";
import { LIKED_TAGS, REWARD_OPTIONS, RECOMMEND_OPTIONS, type RewardKey, type RecommendKey } from "@/lib/feedbackContent";
import { getDefaultOwnerId } from "@/lib/ownerScope";

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
  /** Distinct from improveComment (private) — what the guest is comfortable being quoted saying publicly. Only stored/shown when publicDisplayConsent is true. */
  publicReviewText: string | null;
  publicDisplayConsent: boolean;
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
        // Never store review text without consent, even if the client sent
        // some — the checkbox is the actual gate, not just UI polish.
        publicReviewText: input.publicDisplayConsent ? (input.publicReviewText?.trim() || null) : null,
        publicDisplayConsent: input.publicDisplayConsent,
      },
      select: { voucherCode: true, voucherExpiresAt: true, rewardType: true },
    });
    return { ok: true, feedback };
  } catch (e) {
    if (isUniqueConstraintError(e)) return { ok: false, error: "Feedback has already been submitted for this booking." };
    throw e;
  }
}

/**
 * ownerId is required, not optional — was missing entirely, so every
 * tenant's Owner/Admin saw every other tenant's guest feedback, including
 * real PII (contactName/contactPhone/contactEmail). Scoped transitively
 * via the required `unit` relation, same pattern as every other
 * unit-bearing model in this app (see src/lib/ownerScope.ts).
 */
export async function getFeedbackList(ownerId: string) {
  return prisma.feedbackResponse.findMany({
    where: { unit: { ownerId } },
    orderBy: { createdAt: "desc" },
    include: {
      unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
      booking: { select: { platform: true } },
    },
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

export type PublicReview = {
  id: string;
  contactName: string;
  overallRating: number;
  publicReviewText: string | null;
  createdAt: Date;
  featured: boolean;
  unit: { unitNumber: string; shortName: string };
  booking: { platform: string } | null;
};

/**
 * Backs the public /book reviews marquee (GET /api/reviews). Only a review
 * with BOTH the guest's own consent (publicDisplayConsent) AND an admin's
 * approval (approved) is ever returned here — same two-gate model as the
 * rest of this app's "reveal on demand" discipline elsewhere (see
 * docs/Security.md). Every row in this table can only exist for a
 * completed booking (submission is gated on isBookingCompleted in
 * submitFeedback above), so "Verified Stay" needs no extra check here —
 * it's true by construction. unstable_cache/60s matches the existing
 * public-data pattern (getCachedActiveUnits/getCachedActiveUnitCount in
 * unitsCache.ts) — this is a public, unauthenticated, high-traffic page.
 *
 * ownerId scopes via the reviewed unit's own owner — same real bug class
 * as getCachedActiveUnits before its owner filter was added: with no
 * filter here, every owner's reviews were mixed into one feed. Optional
 * param (defaults to the default owner) so the existing unprefixed /book
 * page keeps working unchanged; the new /o/[ownerSlug]/book page passes
 * its own resolved ownerId.
 */
export const getCachedPublicReviews = unstable_cache(
  async (ownerId?: string): Promise<PublicReview[]> => {
    const resolvedOwnerId = ownerId ?? (await getDefaultOwnerId());
    const rows = await prisma.feedbackResponse.findMany({
      where: { approved: true, publicDisplayConsent: true, unit: { ownerId: resolvedOwnerId } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true, contactName: true, overallRating: true, publicReviewText: true, createdAt: true, featured: true, pinnedAt: true,
        unit: { select: { unitNumber: true, shortName: true } },
        booking: { select: { platform: true } },
      },
    });
    // Pinned-first, each group already in createdAt-desc order from the
    // query above — sorted here in JS rather than via Prisma's nulls-last
    // orderBy, whose availability on this pinned Prisma version isn't
    // worth staking a public page on.
    const pinned = rows.filter((r) => r.pinnedAt);
    const rest = rows.filter((r) => !r.pinnedAt);
    return [...pinned, ...rest].slice(0, 30).map(({ pinnedAt: _pinnedAt, ...r }) => r);
  },
  ["public-reviews"],
  { revalidate: 60 }
);

export type PublicReviewSummary = { averageRating: number; count: number };

export const getCachedPublicReviewSummary = unstable_cache(
  async (ownerId?: string): Promise<PublicReviewSummary> => {
    const resolvedOwnerId = ownerId ?? (await getDefaultOwnerId());
    const rows = await prisma.feedbackResponse.findMany({
      where: { approved: true, publicDisplayConsent: true, unit: { ownerId: resolvedOwnerId } },
      select: { overallRating: true },
    });
    const count = rows.length;
    const averageRating = count === 0 ? 0 : rows.reduce((sum, r) => sum + r.overallRating, 0) / count;
    return { averageRating, count };
  },
  ["public-reviews-summary"],
  { revalidate: 60 }
);
