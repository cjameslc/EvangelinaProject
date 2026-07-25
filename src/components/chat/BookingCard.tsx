"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import type { BookingCardData } from "@/lib/chat/clientTypes";

const STATUS_STYLE: Record<string, string> = {
  Paid: "bg-green/15 text-green",
  Unpaid: "bg-amber/15 text-amber",
  "Checked in": "bg-teal/15 text-teal",
  "Checked out": "bg-[var(--bg-2)] text-[var(--gray)]",
  Cancelled: "bg-rausch/15 text-rausch",
};

/** Renders in place of a #EVA-XXXXXX reference typed in a message — real
 * data fetched live (never cached client-side beyond the component's own
 * lifetime), so it reflects the booking's actual current status even for
 * an old message. Silently renders nothing extra if the ref turns out
 * not to match a real booking (message still shows as plain text). */
export function BookingCard({ confirmationNumber }: { confirmationNumber: string }) {
  const [data, setData] = useState<BookingCardData | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/booking-ref/${encodeURIComponent(confirmationNumber)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setData(j); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [confirmationNumber]);

  if (data === "loading") return <div className="mt-1.5 h-16 w-64 animate-pulse rounded-xl bg-[var(--bg-2)]" />;
  if (!data) return null;

  return (
    <a
      href={`/bookings?search=${encodeURIComponent(data.confirmationNumber)}`}
      className="mt-1.5 block max-w-[320px] rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-s transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,.12)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-extrabold tracking-wide text-rausch">🔑 {data.confirmationNumber}</span>
        <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${STATUS_STYLE[data.status] ?? "bg-[var(--bg-2)] text-[var(--gray)]"}`}>
          {data.status}
        </span>
      </div>
      <div className="mt-1.5 text-[14px] font-extrabold leading-tight">{data.guest}</div>
      <div className="text-[12px] text-[var(--gray)]">Unit {data.unitNumber} · {data.unit}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--gray)]">
        <span>In: {fmtDate(data.checkIn, { month: "short", day: "numeric" })}</span>
        {data.checkOut && <span>Out: {fmtDate(data.checkOut, { month: "short", day: "numeric" })}</span>}
        <span>{data.platform}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[12px] font-bold">₱{data.total.toLocaleString()}</span>
        <span className="text-[11px] font-bold text-rausch">Quick Open →</span>
      </div>
    </a>
  );
}
