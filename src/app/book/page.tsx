import { Suspense } from "react";
import { BookFlowView } from "@/components/guest/BookFlowView";
import { ListingsGrid } from "@/components/guest/ListingsGrid";
import { getCachedActiveUnits } from "@/lib/bookingEngine/unitsCache";

export default async function BookPage() {
  const units = await getCachedActiveUnits();

  return (
    <div>
      <ListingsGrid units={units} />
      <div id="book-flow" className="border-t border-[var(--line)]">
        <Suspense fallback={null}>
          <BookFlowView />
        </Suspense>
      </div>
    </div>
  );
}
