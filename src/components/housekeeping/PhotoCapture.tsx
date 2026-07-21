"use client";

import { useRef, useState } from "react";
import { fetchOrQueue } from "@/lib/offlineQueue";
import { TrashIcon, ClockIcon } from "@/components/ui/Icons";

// `capture="environment"` opens the phone's rear camera directly instead of
// a generic file picker — this is what makes "Upload Photos" a one-tap step
// on a phone rather than a multi-screen file-browser trip.
export function PhotoCapture({
  unitId, photoUrls, onChange,
}: {
  unitId: string;
  photoUrls: string[];
  onChange: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Photos taken while offline get queued (see src/lib/offlineQueue.ts) —
  // deliberately NOT added to photoUrls with a placeholder URL, since a
  // client-only blob: URL would be meaningless once persisted to the DB
  // (it doesn't survive a reload and isn't resolvable from another device).
  // Shown as a distinct "pending" count instead; once the queue flushes and
  // a real Blob URL comes back, it's added to photoUrls for real.
  const [pendingCount, setPendingCount] = useState(0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const { queued, response } = await fetchOrQueue({
      url: "/api/housekeeping/photos",
      method: "POST",
      formDataParts: { file, unitId },
      label: `Housekeeping photo — ${unitId}`,
    });
    setUploading(false);
    if (queued) {
      setPendingCount((n) => n + 1);
      return;
    }
    if (response?.ok) {
      const { url } = await response.json();
      onChange([...photoUrls, url]);
    }
  }

  function remove(url: string) {
    onChange(photoUrls.filter((u) => u !== url));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {photoUrls.map((url) => (
        <div key={url} className="group relative h-14 w-14 flex-none overflow-hidden rounded-lg border border-[var(--line)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button
            onClick={() => remove(url)}
            className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex"
            aria-label="Remove photo"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      {pendingCount > 0 && (
        <div className="flex h-14 w-14 flex-none flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-[var(--line-2)] text-[var(--gray)]">
          <ClockIcon className="h-4 w-4" />
          <span className="text-[9px] font-bold">{pendingCount} pending</span>
        </div>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="btn-sm btn-ghost flex-none border border-dashed border-[var(--line-2)]"
      >
        {uploading ? "Uploading…" : "+ Photo"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  );
}
