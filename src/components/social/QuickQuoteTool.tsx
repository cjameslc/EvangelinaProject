"use client";

import { useState } from "react";
import { quotePrice, type RateTable } from "@/lib/pricing/rates";
import { peso, fmtDate } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { CopyIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

const STATIC_SNIPPETS = [
  {
    id: "ask-dates",
    label: "Ask for dates & pax (before quoting)",
    text: "Hi po! 😊 Salamat po sa pag-message. Pwede ko pong malaman ang preferred check-in at check-out dates ninyo at ilan po kayong guests? Para maibigay ko po ang best available rate. 🏡✨",
  },
  {
    id: "peak-season-note",
    label: "Peak/holiday season note",
    text: "Pwede ko po bang ipaalam na maaaring mag-iba ang rates during holidays or peak season po. Pero for your dates, eto po ang quotation:",
  },
];

/**
 * Real-money quote generator for the booker to copy-paste into their own
 * Messenger/chat reply to a guest — NOT an autonomous chatbot. The peso
 * amounts are computed with the same quotePrice() the rest of the app uses
 * for real bookings; nothing here is AI-generated, since a wrong number in
 * a real quote is a real business/guest-trust problem, not a cosmetic one.
 */
export function QuickQuoteTool({ rates, dpFee, toast }: { rates: RateTable; dpFee: number; toast: (msg: string, isError?: boolean) => void }) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [pax, setPax] = useState("2");
  const [firstName, setFirstName] = useState("");
  const [stayType, setStayType] = useState<"Daycation" | "Night" | "Full">("Full");

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`Copied — ${label} ✓`),
      () => toast("Couldn't copy — select and copy manually.", true)
    );
  }

  const canQuote = !!checkIn;
  const quote = canQuote
    ? quotePrice(stayType, new Date(`${checkIn}T00:00:00Z`), checkOut ? new Date(`${checkOut}T00:00:00Z`) : null, rates, dpFee)
    : null;

  const quoteMessage = quote
    ? `Hi po${firstName ? ` ${firstName}` : ""}! Your total for ${fmtDate(checkIn, { month: "long", day: "numeric", timeZone: "UTC" })}${checkOut ? ` – ${fmtDate(checkOut, { month: "long", day: "numeric", timeZone: "UTC" })}` : ""} (${pax} pax) is ${peso(quote.total)}. The reservation fee is ${peso(quote.dpAmount)} (deductible), and the remaining ${peso(quote.balanceDue)} will be paid upon check-in.\n\nCheck-in: ${fmtDate(checkIn, { month: "long", day: "numeric", timeZone: "UTC" })}${checkOut ? ` | Check-out: ${fmtDate(checkOut, { month: "long", day: "numeric", timeZone: "UTC" })}` : ""} | Guests: ${pax}\n\nMaaaring mag-iba po ang rates during holidays or peak season. If these details are correct po, kindly reply "Yes" and wait lang po while we check the availability. 😊`
    : null;

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-[15px] font-extrabold">Quick Quote Reply</h2>
      <p className="mb-4 text-[13px] text-[var(--gray)]">
        Computes a real quote using the actual rate engine (same rule the rest of the app uses — Fri counts as a weekend day) — for you to review and paste into your own reply, not sent automatically.
      </p>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div>
          <label className="field-label">Check-in</label>
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label">Check-out</label>
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label">Guests</label>
          <input type="number" min={1} value={pax} onChange={(e) => setPax(e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label">First name (optional)</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Andrea" className="field-input" />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {(["Daycation", "Night", "Full"] as const).map((k) => (
          <button key={k} onClick={() => setStayType(k)} className={cn("pill", stayType === k && "on")}>{STAY_TYPES[k].label}</button>
        ))}
      </div>

      {quote && quoteMessage && (
        <div className="mt-4 rounded-2xl border border-green/25 bg-green/5 p-4">
          <p className="mb-1.5 text-[12px] font-bold text-[var(--gray)]">
            {quote.nights} night{quote.nights !== 1 ? "s" : ""} · {peso(quote.standardTotal)}{quote.discountAmount > 0 ? ` − ${peso(quote.discountAmount)} promo` : ""} = {peso(quote.total)} total
          </p>
          <p className="whitespace-pre-line text-[13.5px]">{quoteMessage}</p>
          <button onClick={() => copy(quoteMessage, "quote reply")} className="btn-sm btn mt-3"><CopyIcon className="h-3.5 w-3.5" /> Copy reply</button>
        </div>
      )}
      {!canQuote && <p className="mt-3 text-[12.5px] text-[var(--gray)]">Enter a check-in date to compute a real quote.</p>}

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <p className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Quick openers</p>
        <div className="space-y-2">
          {STATIC_SNIPPETS.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-2 rounded-xl border border-[var(--line)] p-3">
              <p className="text-[13px]">{s.text}</p>
              <button onClick={() => copy(s.text, s.label)} className="flex-none text-[var(--gray)] hover:text-[var(--ink)]"><CopyIcon className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
