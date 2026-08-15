import { NextResponse } from "next/server";
import { getCachedPublicReviews, getCachedPublicReviewSummary } from "@/lib/bookingEngine/feedbackService";

// Public, unauthenticated — backs the guest-reviews marquee on /book.
// force-dynamic: no cookies()/headers() call here for Next to infer
// dynamic rendering from, so without this the route would get statically
// optimized at build time and serve a frozen empty response forever (the
// exact bug already found and fixed once this session on the deployment
// maintenance-flag route — same class of mistake, not repeating it here).
// The real caching is the two functions' own unstable_cache (60s), not
// Next's route-level static optimization.
export const dynamic = "force-dynamic";

export async function GET() {
  const [reviews, summary] = await Promise.all([getCachedPublicReviews(), getCachedPublicReviewSummary()]);
  return NextResponse.json({ reviews, summary });
}
