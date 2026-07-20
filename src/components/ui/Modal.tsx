"use client";

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "@/components/ui/Icons";

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  maxWidth = 540,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape-to-close and initial focus on the close button — shared by every
  // modal in the app, so fixing it once here covers all of them rather than
  // each caller reimplementing (or forgetting) the same keyboard behavior.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-5" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[86vh] w-full flex-col rounded-card bg-[var(--card)] text-[var(--ink)] shadow-card [text-shadow:none]"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[18px] font-extrabold">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-[var(--gray)]">{sub}</p>}
          </div>
          <button ref={closeRef} onClick={onClose} className="btn-icon" aria-label="Close">
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
