import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { CATEGORY_COVER_PHOTOS } from "@/lib/guideNav";
import { REVIEW_SUMMARY, GUEST_REVIEWS } from "@/lib/guidebookContent";

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-rausch" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {"★".repeat(full)}
      {"☆".repeat(5 - full)}
    </span>
  );
}

// Real guest quotes as supplied by the host, sourced from the business's
// Airbnb/Google listings — see REVIEW_SUMMARY/GUEST_REVIEWS in
// guidebookContent.ts, the single place to update when new real reviews
// come in. Never fabricate a testimonial or rating here.
export default function ReviewsPage() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon="⭐" image={CATEGORY_COVER_PHOTOS.reviews} title="Guest Reviews" subtitle="What guests are saying." />

      <div className="card mt-3 p-6 text-center">
        <div className="text-[28px] font-extrabold">
          ⭐ {REVIEW_SUMMARY.overallRating.toFixed(1)} <span className="text-[16px] font-bold text-[var(--gray)]">/ 5.0</span>
        </div>
        <div className="mt-1 text-[13px] font-bold text-[var(--gray)]">({REVIEW_SUMMARY.reviewCount} Reviews)</div>
        <p className="mt-3 text-[15px] font-extrabold">&ldquo;Your Home Away From Home&rdquo;</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--gray)]">See what our guests love about staying at Evangelina&rsquo;s Staycation.</p>
      </div>

      <div className="mt-4 space-y-3">
        {GUEST_REVIEWS.map((r, i) => (
          <div key={i} className="card p-4">
            <Stars value={5} />
            <p className="mt-2 text-[13.5px] leading-relaxed">&ldquo;{r.quote}&rdquo;</p>
            <div className="mt-2.5 text-[12px] font-bold text-[var(--gray)]">
              — {r.name} · Stayed in {r.unit} • {r.date}
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-4 p-5">
        <h3 className="mb-3 text-[13px] font-extrabold">⭐ Guest Satisfaction</h3>
        <div className="space-y-2">
          {REVIEW_SUMMARY.categoryRatings.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--gray)]">{c.label}</span>
              <span className="flex items-center gap-1.5 font-bold">
                <Stars value={c.value} /> {c.value.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-3 p-5 text-center">
        <p className="text-[14px] font-extrabold">❤️ {REVIEW_SUMMARY.recommendPct}% of guests recommend Evangelina&rsquo;s Staycation.</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--gray)]">
          Join hundreds of happy guests who have enjoyed a comfortable, convenient, and memorable stay in the heart of Cubao.
        </p>
      </div>
    </div>
  );
}
