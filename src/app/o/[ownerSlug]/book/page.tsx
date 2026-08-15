import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BookFlowView } from "@/components/guest/BookFlowView";
import { ListingsGrid } from "@/components/guest/ListingsGrid";
import { getCachedActiveUnits } from "@/lib/bookingEngine/unitsCache";
import { getCachedBookingSettings } from "@/lib/bookingEngine/settingsCache";
import { checkAvailabilityForUnits } from "@/lib/bookingEngine/availabilityService";
import { manilaTodayISO } from "@/lib/manilaTime";
import { getCachedPublicReviews, getCachedPublicReviewSummary } from "@/lib/bookingEngine/feedbackService";
import { getOwnerBySlug } from "@/lib/ownerScope";

/**
 * The per-owner counterpart to /book — the real entry point for any owner
 * other than the default (Evangelina's), whose guest site otherwise has no
 * routing of its own at all (see getDefaultOwnerId's doc comment in
 * ownerScope.ts). Structurally identical to /book/page.tsx; the only
 * difference is resolving ownerId from the slug instead of defaulting, and
 * threading it into every data call below plus ListingsGrid/BookFlowView
 * (so their own internal links/fetches stay scoped to this owner too).
 */
export default async function OwnerBookPage({ params }: { params: { ownerSlug: string } }) {
  const owner = await getOwnerBySlug(params.ownerSlug);
  if (!owner) notFound();

  if (owner.status === "SUSPENDED") {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-16 text-center">
        <div className="text-[40px]">🚧</div>
        <h1 className="mt-3 text-[20px] font-extrabold">{owner.businessName} isn&apos;t taking bookings right now</h1>
        <p className="mt-2 text-[14px] text-[var(--gray)]">Please check back later.</p>
      </div>
    );
  }

  const units = await getCachedActiveUnits(owner.id);

  const [settings, availabilityToday, reviews, reviewSummary] = await Promise.all([
    getCachedBookingSettings(owner.id),
    checkAvailabilityForUnits(
      units.map((u) => u.id),
      { date: manilaTodayISO(), stayType: "Daycation" }
    ),
    getCachedPublicReviews(owner.id),
    getCachedPublicReviewSummary(owner.id),
  ]);

  const amenities = ((settings.amenities as { icon: string; label: string }[] | null) ?? []).slice(0, 4);

  return (
    <div>
      <ListingsGrid
        units={units}
        availabilityToday={availabilityToday}
        amenities={amenities}
        address={settings.address}
        contactPhone={settings.contactPhone}
        reviews={reviews}
        reviewSummary={reviewSummary}
        ownerSlug={owner.slug}
        businessName={owner.businessName}
        logoUrl={owner.logoUrl}
        primaryColor={owner.primaryColor}
      />
      <div id="book-flow" className="border-t border-[var(--line)]">
        <Suspense fallback={null}>
          <BookFlowView paymentQrUrl={settings.paymentQrUrl} paymentInstructions={settings.paymentInstructions} ownerSlug={owner.slug} />
        </Suspense>
      </div>
    </div>
  );
}
