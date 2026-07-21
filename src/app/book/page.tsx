import { Suspense } from "react";
import { BookFlowView } from "@/components/guest/BookFlowView";

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookFlowView />
    </Suspense>
  );
}
