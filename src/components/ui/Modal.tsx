"use client";

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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-5" onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full flex-col rounded-card bg-[var(--card)] shadow-card"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-[18px] font-extrabold">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-[var(--gray)]">{sub}</p>}
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
