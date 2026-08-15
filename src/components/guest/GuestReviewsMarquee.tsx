"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Star, BadgeCheck } from "lucide-react";
import { fmtDate, formatUnitDisplay, initials } from "@/lib/format";
import { PLATFORM_LABEL } from "@/lib/constants";
import type { PublicReview, PublicReviewSummary } from "@/lib/bookingEngine/feedbackService";

/**
 * Guest testimonials on /book, right after the units grid — server-fetched
 * (GET-time, via getCachedPublicReviews/getCachedPublicReviewSummary in
 * book/page.tsx) rather than a client fetch, so there's no loading flicker
 * on a public, high-traffic page. A review only ever appears here once the
 * guest consented AND an admin approved it (see FeedbackTab.tsx).
 *
 * The continuous scroll is plain CSS (`animate-marquee`, tailwind.config.ts)
 * — matches this codebase's existing convention for ambient/continuous
 * motion (ken-burns/sheen/dust in CinematicHero above this same section),
 * not framer-motion, which this app already uses for state-driven
 * transitions instead. useReducedMotion() is still the framer-motion hook
 * (the one already-established convention in this codebase, MotivationBanner.tsx)
 * even though nothing else here is framer-motion — it's just a reactive
 * media-query read, no motion components required to use it.
 */
export function GuestReviewsMarquee({ reviews, summary, businessName = "Evangelina's Staycation" }: { reviews: PublicReview[]; summary: PublicReviewSummary; businessName?: string }) {
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);

  return (
    <div id="reviews" className="border-t border-[var(--gold-40)] bg-[var(--cream)] py-14 sm:py-16" role="region" aria-label="Guest reviews">
      <div className="mx-auto max-w-[720px] px-4 text-center sm:px-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--bronze)]">What Our Guests Say</span>
        <h2 style={{ fontFamily: "var(--font-fraunces)" }} className="mt-2 text-[28px] font-medium text-[var(--matte)] sm:text-[32px]">
          Trusted by Guests Who&rsquo;ve Stayed With Us
        </h2>
        <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-relaxed text-[var(--matte)]/70">
          Read authentic reviews from guests who have stayed at {businessName} and discover why we&rsquo;re one of the preferred staycation destinations.
        </p>
        {summary.count > 0 && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--gold-40)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--matte)]">
            <Star className="h-4 w-4 fill-[var(--gold)] text-[var(--gold)]" />
            {summary.averageRating.toFixed(1)} / 5
            <span className="font-normal text-[var(--matte)]/60">· Based on {summary.count} verified stay{summary.count === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      {reviews.length === 0 ? (
        <div className="mx-auto mt-8 max-w-[420px] px-4 text-center">
          <p className="text-[13.5px] text-[var(--matte)]/70">Be the first guest to share your experience with {businessName}.</p>
          <a href="/guest-login" className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-[var(--gold)] to-[var(--gold-light)] px-5 py-2.5 text-[13px] font-bold text-[var(--matte)] shadow-[0_10px_28px_rgba(201,162,75,.35)] transition hover:brightness-105">
            Leave a Review
          </a>
        </div>
      ) : reducedMotion ? (
        <div className="mt-9 flex snap-x gap-5 overflow-x-auto px-4 pb-2 sm:px-6" role="list">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} className="snap-start" />)}
        </div>
      ) : (
        <div
          className="mt-9 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]"
          onMouseEnter={pause}
          onMouseLeave={resume}
          onFocus={pause}
          onBlur={resume}
          onTouchStart={pause}
          onTouchEnd={resume}
        >
          <div className="flex w-max gap-5 px-4 sm:px-6" role="list">
            {/* Track duplicated once — animate-marquee scrolls exactly one
                track-width (translateX(-50%)), so the loop point is
                invisible: track B is already in the same position track A
                started at. */}
            {[...reviews, ...reviews].map((r, i) => (
              <ReviewCard key={`${r.id}-${i}`} review={r} className="animate-marquee" style={{ animationPlayState: paused ? "paused" : "running" }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review: r, className = "", style }: { review: PublicReview; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      role="listitem"
      style={style}
      className={`w-[280px] flex-none rounded-[20px] border border-[var(--gold-20)] bg-white p-5 text-left shadow-[0_10px_28px_rgba(28,20,10,.06)] sm:w-[320px] ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[var(--gold-20)] text-[13px] font-bold text-[var(--bronze)]">
          {initials(r.contactName)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-[var(--matte)]">{r.contactName}</div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-green">
            <BadgeCheck className="h-3.5 w-3.5" /> Verified Stay
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-0.5" aria-label={`${r.overallRating} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={`h-4 w-4 ${i < r.overallRating ? "fill-[var(--gold)] text-[var(--gold)]" : "text-[var(--gold-20)]"}`} />
        ))}
      </div>

      {r.publicReviewText && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--matte)]/85">&ldquo;{r.publicReviewText}&rdquo;</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[var(--bronze)]">
        <span className="rounded-full bg-[var(--gold-20)] px-2.5 py-1">Stayed at {formatUnitDisplay(r.unit.unitNumber, r.unit.shortName)}</span>
        {r.booking?.platform && <span className="rounded-full bg-[var(--matte)]/5 px-2.5 py-1 text-[var(--matte)]/70">{PLATFORM_LABEL[r.booking.platform] ?? r.booking.platform}</span>}
        <span className="text-[var(--matte)]/50">{fmtDate(r.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </div>
  );
}
