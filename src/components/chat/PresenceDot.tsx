"use client";

import { STATUS_COLOR } from "@/lib/chat/constants";

/** Small colored status dot — pulses gently while Online, per the spec's
 * "animated presence indicators" ask. Static for every other status
 * (busy/away/dnd/meeting/offline aren't "live" states worth animating). */
export function PresenceDot({ status, size = 10 }: { status: string; size?: number }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.OFFLINE;
  return (
    <span className="relative inline-flex flex-none" style={{ width: size, height: size }}>
      {status === "ONLINE" && (
        <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color }} />
      )}
      <span className="relative inline-block rounded-full ring-2 ring-[var(--card)]" style={{ width: size, height: size, background: color }} />
    </span>
  );
}
