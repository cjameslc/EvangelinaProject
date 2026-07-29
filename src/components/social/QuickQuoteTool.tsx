"use client";

import { useState } from "react";
import { quotePrice, type RateTable } from "@/lib/pricing/rates";
import { peso, fmtDate, fmtTimeStr } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { CopyIcon } from "@/components/ui/Icons";
import { TimePicker } from "@/components/ui/TimePicker";
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
  const [stayType, setStayType] = useState<"Daycation" | "Night" | "Full" | "Flexible">("Full");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`Copied — ${label} ✓`),
      () => toast("Couldn't copy — select and copy manually.", true)
    );
  }

  // Flexible's price depends on whether the picked window reads as
  // day-like or night-like (the weekday-night promo eligibility check in
  // quotePrice) — unlike Daycation/Night/Full, there's no safe default to
  // quote against without both real times, so it's required rather than
  // silently guessed.
  const needsFlexTimes = stayType === "Flexible";
  const canQuote = !!checkIn && (!needsFlexTimes || (!!checkInTime && !!checkOutTime));
  const quote = canQuote
    ? quotePrice(stayType, new Date(`${checkIn}T00:00:00Z`), checkOut ? new Date(`${checkOut}T00:00:00Z`) : null, rates, dpFee, checkInTime || null)
    : null;

  const checkInLabel = `${fmtDate(checkIn, { month: "long", day: "numeric", timeZone: "UTC" })}${checkInTime ? ` · ${fmtTimeStr(checkInTime)}` : ""}`;
  const checkOutLabel = checkOut
    ? `${fmtDate(checkOut, { month: "long", day: "numeric", timeZone: "UTC" })}${checkOutTime ? ` · ${fmtTimeStr(checkOutTime)}` : ""}`
    : checkOutTime ? fmtTimeStr(checkOutTime) : null;
  const quoteMessage = quote
    ? `Hi po${firstName ? ` ${firstName}` : ""}! Your total for ${checkInLabel}${checkOutLabel ? ` – ${checkOutLabel}` : ""} (${pax} pax) is ${peso(quote.total)}. The reservation fee is ${peso(quote.dpAmount)} (deductible), and the remaining ${peso(quote.balanceDue)} will be paid upon check-in.\n\nCheck-in: ${checkInLabel}${checkOutLabel ? ` | Check-out: ${checkOutLabel}` : ""} | Guests: ${pax}\n\nMaaaring mag-iba po ang rates during holidays or peak season. If these details are correct po, kindly reply "Yes" and wait lang po while we check the availability. 😊`
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
        {(["Daycation", "Night", "Full", "Flexible"] as const).map((k) => (
          <button key={k} onClick={() => setStayType(k)} className={cn("pill", stayType === k && "on")}>{STAY_TYPES[k].label}</button>
        ))}
      </div>

      {needsFlexTimes && (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:w-1/2">
          <div>
            <label className="field-label">Check-in time <span className="text-rausch">*</span></label>
            <TimePicker value={checkInTime} onChange={setCheckInTime} />
          </div>
          <div>
            <label className="field-label">Check-out time <span className="text-rausch">*</span></label>
            <TimePicker value={checkOutTime} onChange={setCheckOutTime} />
          </div>
        </div>
      )}

      {quote && quoteMessage && (
        <div className="mt-4 rounded-2xl border border-green/25 bg-green/5 p-4">
          <p className="mb-1.5 text-[12px] font-bold text-[var(--gray)]">
            {quote.nights} night{quote.nights !== 1 ? "s" : ""} · {peso(quote.standardTotal)}{quote.discountAmount > 0 ? ` − ${peso(quote.discountAmount)} promo` : ""}{quote.flexibleFeeAmount > 0 ? ` + ${peso(quote.flexibleFeeAmount)} Flexible fee` : ""} = {peso(quote.total)} total
          </p>
          <p className="whitespace-pre-line text-[13.5px]">{quoteMessage}</p>
          <button onClick={() => copy(quoteMessage, "quote reply")} className="btn-sm btn mt-3"><CopyIcon className="h-3.5 w-3.5" /> Copy reply</button>
        </div>
      )}
      {!canQuote && (
        <p className="mt-3 text-[12.5px] text-[var(--gray)]">
          {needsFlexTimes && checkIn ? "Pick both a check-in and check-out time to compute a Flexible quote." : "Enter a check-in date to compute a real quote."}
        </p>
      )}

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
