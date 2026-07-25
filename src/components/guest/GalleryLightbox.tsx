"use client";

import { useCallback, useEffect, useState } from "react";
import type { GalleryImage } from "@/lib/galleryContent";

export type GalleryLightboxItem = GalleryImage & { category: string };

/**
 * Pinterest-style masonry (CSS columns, natural aspect ratio — these are
 * real photos of varying shapes, not forced squares) with a full-screen
 * lightbox on tap. All real business photos (see galleryContent.ts) — no
 * Unsplash imagery here, so no attribution/tracking concerns.
 */
export function GalleryMasonry({ items }: { items: GalleryLightboxItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const prev = useCallback(() => setOpenIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length)), [items.length]);
  const next = useCallback(() => setOpenIndex((i) => (i === null ? null : (i + 1) % items.length)), [items.length]);

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openIndex, close, prev, next]);

  const active = openIndex !== null ? items[openIndex] : null;

  return (
    <>
      <div className="columns-2 gap-2 sm:columns-3 [&>*]:mb-2">
        {items.map((img, i) => (
          <button
            key={img.src}
            onClick={() => setOpenIndex(i)}
            className="block w-full break-inside-avoid overflow-hidden rounded-xl bg-[var(--bg-2)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              className="w-full transition duration-300 hover:scale-105 hover:opacity-90"
            />
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={active.alt}
          onClick={close}
        >
          <div className="flex items-center justify-between p-4 text-white/80">
            <span className="text-[12.5px] font-semibold">{openIndex! + 1} / {items.length}</span>
            <button onClick={close} className="text-[22px] leading-none" aria-label="Close">✕</button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-2 pb-4">
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white sm:left-4"
              aria-label="Previous photo"
            >
              ‹
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.src}
              alt={active.alt}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white sm:right-4"
              aria-label="Next photo"
            >
              ›
            </button>
          </div>
          {active.alt && (
            <p className="px-4 pb-4 text-center text-[12.5px] text-white/70" onClick={(e) => e.stopPropagation()}>
              {active.alt}
            </p>
          )}
        </div>
      )}
    </>
  );
}
