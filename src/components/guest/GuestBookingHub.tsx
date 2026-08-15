"use client";

import { useState } from "react";
import Link from "next/link";
import { GuidebookView } from "@/components/guest/GuidebookView";
import { BookingDetailClient } from "@/components/guest/BookingDetailClient";

type Tab = "guide" | "booking";

/**
 * The Digital Guidebook is the main experience for a confirmed booking —
 * WiFi, door code, nearby places, the AI Concierge — with the payment/
 * invoice/cancel details (the old standalone page) now a secondary tab
 * rather than something you navigate away to. Both child components accept
 * the same merged booking object (see getGuestBookingForGuide in
 * guestService.ts); each just reads the subset of fields it needs.
 */
export function GuestBookingHub({ booking, guidebook }: { booking: any; guidebook: any }) {
  const [tab, setTab] = useState<Tab>("guide");

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-1 px-4 py-2 sm:px-6">
          <Link href="/my-bookings" className="mr-1 text-[13px] font-semibold text-[var(--gray)] hover:text-[var(--ink)]">‹</Link>
          <TabButton active={tab === "guide"} onClick={() => setTab("guide")}>📖 Guidebook</TabButton>
          <TabButton active={tab === "booking"} onClick={() => setTab("booking")}>🧾 Booking</TabButton>
        </div>
      </div>

      {tab === "guide" ? (
        <GuidebookView booking={booking} guidebook={guidebook} />
      ) : (
        <BookingDetailClient booking={booking} paymentQrUrl={guidebook?.paymentQrUrl ?? null} paymentInstructions={guidebook?.paymentInstructions ?? null} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${active ? "bg-rausch text-white" : "text-[var(--gray)] hover:bg-[var(--bg-2)]"}`}
    >
      {children}
    </button>
  );
}
