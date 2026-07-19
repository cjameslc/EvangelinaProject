"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/Icons";

export function Pagination({
  page, pageCount, onPageChange, totalLabel,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** e.g. "42 results" — shown to the left of the controls. */
  totalLabel?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
      {totalLabel && <p className="text-[12.5px] text-[var(--gray)]">{totalLabel}</p>}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-icon !h-8 !w-8 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <span className="min-w-[70px] text-center text-[12.5px] font-bold text-[var(--gray)]">
          Page {page} of {pageCount}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="btn-icon !h-8 !w-8 disabled:opacity-40"
          aria-label="Next page"
        >
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
