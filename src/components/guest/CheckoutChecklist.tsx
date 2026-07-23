"use client";

import { useState } from "react";

/** Local-only checkbox state (nothing persisted) — just lets a guest tick
 * items off as they go, matching the "interactive Checkout checklist"
 * requested in the Guest Experience spec. */
export function CheckoutChecklist({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const done = checked.filter(Boolean).length;

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
        <span>✅ Checkout checklist</span>
        <span className="text-rausch">{done}/{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <button
            key={item}
            onClick={() => toggle(i)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${checked[i] ? "border-green/40 bg-green/10" : "border-[var(--line)] hover:bg-[var(--bg-2)]"}`}
          >
            <span className={`grid h-5 w-5 flex-none place-items-center rounded-md border text-[11px] font-bold ${checked[i] ? "border-green bg-green text-white" : "border-[var(--line)] text-transparent"}`}>✓</span>
            <span className={`text-[13.5px] font-semibold ${checked[i] ? "text-[var(--gray)] line-through" : ""}`}>{item}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
