"use client";

import { useEffect, useId, useRef, useLayoutEffect } from "react";
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
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Every caller passes onClose as a fresh inline arrow function
  // (onClose={() => setOpen(false)}), so its reference changes on every
  // render of the parent — including every keystroke in a field the
  // parent's state backs. Keeping it out of the effect below via a ref
  // (updated on every render, but never itself a dependency) means the
  // effect only re-runs when `open` actually changes, not on every
  // unrelated parent re-render.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Escape-to-close and initial focus on the close button — shared by every
  // modal in the app, so fixing it once here covers all of them rather than
  // each caller reimplementing (or forgetting) the same keyboard behavior.
  // Also restores focus to whatever triggered the modal once it closes —
  // without this, a keyboard/screen-reader user's focus was silently
  // dropped to <body> on close, forcing them to re-navigate from the top
  // of the page instead of picking up where they left off.
  //
  // Confirmed live bug, now fixed: with `onClose` in this effect's own
  // dependency array (its old form), every keystroke in any text field
  // inside a modal re-ran this effect — including the closeRef.current
  // .focus() call — so focus jumped from the field the user was typing in
  // back to the ✕ button after every single character. Depending only on
  // `open` (and reading onCloseRef.current inside, never a stale closure)
  // means this now runs exactly once per open, not once per keystroke.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

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
