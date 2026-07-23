import Link from "next/link";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { CATEGORY_ART } from "@/lib/guideNav";

// No review-collection mechanism exists anywhere in this app yet, and no
// real guest reviews were supplied — this is an honest empty state rather
// than fabricated testimonials. Swap this in once real reviews exist.
export default function ReviewsPage() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon="⭐" art={CATEGORY_ART.reviews} title="Guest Reviews" subtitle="What guests are saying." />

      <div className="card mt-3 p-8 text-center">
        <div className="text-[32px]">🌱</div>
        <p className="mt-3 text-[14px] font-bold">No reviews yet</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--gray)]">
          We&rsquo;re just getting started collecting guest feedback — check back soon, or be one of our first reviewers after your stay.
        </p>
        <Link href="/book" className="btn-primary mt-4 inline-flex">Book a stay</Link>
      </div>
    </div>
  );
}
