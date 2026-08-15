"use client";

import { useEffect, useId, useRef, useLayoutEffect, useState } from "react";
import { CloseIcon } from "@/components/ui/Icons";

/** Side-anchored panel for "peek at one item's detail without leaving the
 * page behind it" — a booking on the Calendar, a row's full record, etc.
 * Same a11y contract as Modal (escape-to-close, focus-to-close-button on
 * open, focus-restore on close) — copy that scaffolding exactly rather than
 * reinventing it, see Modal.tsx's own comments for why each piece exists.
 * Differs from Modal in presentation only: slides in from the right instead
 * of appearing centered, so it reads as "a panel next to what you were
 * looking at" rather than "a task that takes over the screen" — the right
 * call when the calling context (the calendar grid) is still relevant
 * background, not something to fully dim/block out.
 * Global prefers-reduced-motion handling in globals.css already zeroes out
 * this transition's duration app-wide — nothing extra needed here. */
export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  maxWidth = 440,
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
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Starts closed every mount so the panel actually slides in on open
  // (rather than snapping straight to its open position) — flipped true a
  // frame after mount via requestAnimationFrame, the same "legacy but
  // universally supported" pattern used for CSS-transition entrances
  // before @starting-style, since this only needs to work in one browser
  // generation's worth of Safari/Chrome, not bleeding-edge only.
  const [mounted, setMounted] = useState(false);

  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) { setMounted(false); return; }
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => setMounted(true));
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/45 transition-opacity duration-300 ease-[var(--ease-out)]"
      style={{ opacity: mounted ? 1 : 0 }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full flex-col bg-[var(--card)] text-[var(--ink)] shadow-elevation-4 [text-shadow:none] transition-transform duration-300 ease-[var(--ease-out)]"
        style={{ maxWidth, transform: mounted ? "translateX(0)" : "translateX(100%)" }}
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
