"use client";

import { useRef, useState, type ReactNode, type WheelEvent } from "react";

/**
 * Wraps a horizontally-scrolling row of cards (Guest tips, Personalize your
 * guide, etc.) with two things a bare `overflow-x-auto` row doesn't give
 * you: a fade at whichever edge has more content hidden past it (so a
 * cut-off card like "Nightlife" reads as "scroll for more," not as
 * missing/broken), and vertical-wheel-to-horizontal-scroll so a plain
 * desktop mouse (no trackpad, no shift+wheel habit) can actually reach it —
 * scrollbar-none already hides the one visual hint a mouse user would
 * otherwise have.
 */
export function HScrollRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function updateEdges() {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 2);
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Only take over when the row can actually scroll further in the
    // direction implied — lets a page-level vertical scroll pass through
    // once this row has nothing more to give in that direction.
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    updateEdges();
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={updateEdges}
        onWheel={onWheel}
        className={`scrollbar-none flex gap-2.5 overflow-x-auto pb-1 ${className}`}
      >
        {children}
      </div>
      {!atStart && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--bg)] to-transparent" />
      )}
      {!atEnd && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--bg)] to-transparent" />
      )}
    </div>
  );
}
