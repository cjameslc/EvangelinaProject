import { Suspense } from "react";
import { BookFlowView } from "@/components/guest/BookFlowView";
import { ListingsGrid } from "@/components/guest/ListingsGrid";
import { getCachedActiveUnits } from "@/lib/bookingEngine/unitsCache";
import { getCachedBookingSettings } from "@/lib/bookingEngine/settingsCache";
import { checkAvailabilityForUnits } from "@/lib/bookingEngine/availabilityService";
import { manilaTodayISO } from "@/lib/manilaTime";
import { getCachedPublicReviews, getCachedPublicReviewSummary } from "@/lib/bookingEngine/feedbackService";
import { getDefaultOwnerId } from "@/lib/ownerScope";

export default async function BookPage() {
  const units = await getCachedActiveUnits();
  const defaultOwnerId = await getDefaultOwnerId();

  // Real "Available Today" / "Booked Today" badges — reuses the app's one
  // source of truth for occupancy (checkAvailabilityForUnits, backed by
  // stayRange.ts) instead of a naive date-only check, per the "Fully
  // Booked" banner lesson: any ad hoc reimplementation of this logic can
  // silently disagree with what actually happens at booking time.
  const [settings, availabilityToday, reviews, reviewSummary] = await Promise.all([
    getCachedBookingSettings(defaultOwnerId!),
    checkAvailabilityForUnits(
      units.map((u) => u.id),
      { date: manilaTodayISO(), stayType: "Daycation" }
    ),
    getCachedPublicReviews(),
    getCachedPublicReviewSummary(),
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
      />
      <div id="book-flow" className="border-t border-[var(--line)]">
        <Suspense fallback={null}>
          <BookFlowView paymentQrUrl={settings.paymentQrUrl} paymentInstructions={settings.paymentInstructions} />
        </Suspense>
      </div>
    </div>
  );
}
