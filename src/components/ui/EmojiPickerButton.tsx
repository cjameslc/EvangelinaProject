"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// A curated set relevant to what actually gets named here — supply items
// and custom bills — rather than a full emoji keyboard, which would be
// overkill for "pick an icon for this line item."
const EMOJI_OPTIONS = [
  "🧻", "🧴", "🧹", "🧼", "🪒", "☕", "🧊", "🔥", "💡", "🔌", "🚿", "🛏️",
  "🧺", "🧽", "🗑️", "🧯", "🏦", "🏢", "💧", "⚡", "🌐", "📺", "💳", "🧾",
  "🔧", "🛠️", "📦", "🛁", "🚽", "🪑", "🧦", "🍽️",
];

/** Small trigger + popover grid that appends the picked emoji onto whatever
 * text field it's paired with — used for supply item names and custom bill
 * labels, so a one-off entry can get a distinct icon instead of the same
 * generic default every custom entry otherwise shares. */
export function EmojiPickerButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative flex-none" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn("btn-icon", open && "border-[var(--ink)]")}
        aria-label="Insert emoji"
        title="Insert emoji"
      >
        <span className="text-[16px] leading-none">🙂</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 grid w-[236px] grid-cols-8 gap-1 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-2.5 shadow-card">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onSelect(emoji); setOpen(false); }}
              className="grid h-7 w-7 place-items-center rounded-lg text-[16px] hover:bg-[var(--bg-2)]"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
