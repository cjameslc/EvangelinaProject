"use client";

import { useMemo, useState } from "react";
import type { FaqCategory } from "@/lib/guidebookService";

export function FaqAccordion({ faqs }: { faqs: FaqCategory[] }) {
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return faqs;
    return faqs
      .map((cat) => ({ ...cat, items: cat.items.filter((i) => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)) }))
      .filter((cat) => cat.items.length > 0);
  }, [faqs, search]);

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search FAQs (e.g. parking, check-in, pets)"
        className="field-input"
      />

      <div className="mt-3 space-y-4">
        {filtered.length === 0 ? (
          <div className="card p-6 text-center text-[13.5px] text-[var(--gray)]">No FAQs match &ldquo;{search}&rdquo;.</div>
        ) : (
          filtered.map((cat) => (
            <div key={cat.category} className="card p-5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">{cat.category}</div>
              <div className="divide-y divide-[var(--line)]">
                {cat.items.map((item, i) => {
                  const key = `${cat.category}-${i}`;
                  const open = openKey === key;
                  return (
                    <div key={key}>
                      <button onClick={() => setOpenKey((k) => (k === key ? null : key))} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                        <span className="text-[13.5px] font-bold">{item.q}</span>
                        <span className={`flex-none text-[13px] text-[var(--gray)] transition-transform ${open ? "rotate-45" : ""}`}>+</span>
                      </button>
                      {open && <p className="pb-3 text-[13px] leading-relaxed text-[var(--gray)]">{item.a}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
