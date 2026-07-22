"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { peso } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { resizeImageForUpload } from "@/lib/imageResize";
import { RateBreakdown } from "@/components/guest/RateBreakdown";
import { manilaTodayISO } from "@/lib/manilaTime";
import type { PriceQuote } from "@/lib/pricing/rates";

type StayType = "Daycation" | "Night" | "Full" | "Flexible";
type QuoteResult = { unitId: string; shortName: string; unitNumber: string; photoUrl: string | null; available: boolean; quote: PriceQuote };

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function BookFlowView() {
  const searchParams = useSearchParams();
  const today = manilaTodayISO();
  const [step, setStep] = useState<"search" | "select" | "details" | "payment" | "done">("search");
  // A stale bookmarked/shared link could carry a checkIn param that's
  // already in the past — never seed the form with a date that's no longer
  // selectable.
  const [date, setDate] = useState(() => {
    const c = searchParams?.get("checkIn") ?? "";
    return c && c < today ? "" : c;
  });
  const [checkOutDate, setCheckOutDate] = useState(searchParams?.get("checkOut") ?? "");
  const [stayType, setStayType] = useState<StayType>("Full");
  // Flexible only — any check-in/check-out time within the same day, unlike
  // Daycation/Night's fixed windows.
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [results, setResults] = useState<QuoteResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [selected, setSelected] = useState<QuoteResult | null>(null);
  const preselectedUnit = searchParams?.get("unit");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pax, setPax] = useState("");
  const [specialRequest, setSpecialRequest] = useState("");
  const [paymentType, setPaymentType] = useState<"full" | "down_payment">("full");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);
  const [confirmationNumber, setConfirmationNumber] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofResult, setProofResult] = useState<{ status: string; note: string } | null>(null);
  const [proofError, setProofError] = useState("");

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!date || loadingResults) return;
    if (stayType === "Flexible" && (!checkInTime || !checkOutTime)) {
      setError("Pick a check-in and check-out time.");
      return;
    }
    setLoadingResults(true);
    setError("");
    try {
      const params = new URLSearchParams({ date, stayType });
      if (stayType !== "Daycation" && stayType !== "Flexible" && checkOutDate) params.set("checkOutDate", checkOutDate);
      if (stayType === "Flexible") { params.set("checkInTime", checkInTime); params.set("checkOutTime", checkOutTime); }
      const res = await fetch(`/api/guest/booking-quote?${params}`);
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't check availability."); return; }
      setResults(j.results);
      setStep("select");
      if (preselectedUnit) {
        const match = j.results.find((r: QuoteResult) => r.unitId === preselectedUnit);
        if (match?.available) chooseUnit(match);
      }
    } catch {
      setError("Couldn't check availability. Please try again.");
    } finally {
      setLoadingResults(false);
    }
  }

  function chooseUnit(r: QuoteResult) {
    setSelected(r);
    setStep("details");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/guest/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selected.unitId, date, checkOutDate: stayType === "Daycation" || stayType === "Flexible" ? null : checkOutDate, stayType,
          checkInTime: stayType === "Flexible" ? checkInTime : null,
          checkOutTime: stayType === "Flexible" ? checkOutTime : null,
          name, email, phone, pax: pax || null, specialRequest: specialRequest || null, paymentType,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't complete the booking."); return; }
      setConfirmedBookingId(j.booking.id);
      setConfirmationNumber(j.booking.confirmationNumber ?? null);
      // The booking API already signed the guest in (session cookie set on
      // its response) and sent a real confirmation email — no separate
      // magic-link request needed just to reach the payment step.
      setStep("payment");
    } catch {
      setError("Couldn't complete the booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadProofNow(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !confirmedBookingId) return;
    setUploadingProof(true);
    setProofError("");
    try {
      const resized = await resizeImageForUpload(file);
      const fd = new FormData();
      fd.append("file", resized);
      fd.append("field", paymentType === "down_payment" ? "dpProofUrl" : "proofUrl");
      const res = await fetch(`/api/guest/bookings/${confirmedBookingId}/payment-proof`, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setProofError(j?.error ?? "Couldn't upload proof."); return; }
      setProofResult({ status: j.status, note: j.note });
    } catch {
      setProofError("Couldn't upload proof. Please try again.");
    } finally {
      setUploadingProof(false);
    }
  }

  useEffect(() => {
    if (date && preselectedUnit && step === "search") search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Night stay is always exactly one night — checkout is always the day
  // after check-in, not a guest choice. Only Full stay can span more than
  // one night. Keeps this in sync whenever the check-in date changes or
  // the guest switches to Night.
  useEffect(() => {
    if (stayType === "Night" && date) setCheckOutDate(nextDay(date));
  }, [stayType, date]);

  if (step === "payment" && selected) {
    const amountDueNow = paymentType === "down_payment" ? selected.quote.dpAmount : selected.quote.total;
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <div className="mb-3 text-5xl">💳</div>
        <h1 className="text-[22px] font-extrabold">Reserve with payment</h1>
        {confirmationNumber && (
          <p className="mt-2 text-[13px] text-[var(--gray)]">Confirmation number <span className="font-extrabold text-[var(--ink)]">{confirmationNumber}</span></p>
        )}
        <div className="card mt-5 p-4 text-left">
          <div className="flex justify-between text-[15px] font-extrabold"><span>{paymentType === "down_payment" ? "Down payment due now" : "Total due now"}</span><span>{peso(amountDueNow)}</span></div>
          {paymentType === "down_payment" && (
            <div className="mt-1 flex justify-between text-[12.5px] text-[var(--gray)]"><span>Balance due later</span><span>{peso(selected.quote.balanceDue)}</span></div>
          )}
        </div>

        {proofResult?.status === "auto_approved" && (
          <div className="card mt-4 p-4 text-[13.5px] text-teal">✓ {proofResult.note}</div>
        )}
        {proofResult?.status === "needs_review" && (
          <div className="card mt-4 p-4 text-[13.5px] text-amber">{proofResult.note}</div>
        )}
        {(!proofResult || proofResult.status === "rejected") && (
          <div className="card mt-4 space-y-2 p-4 text-left">
            {proofResult?.status === "rejected" && (
              <p className="text-[13px] font-semibold text-rausch">{proofResult.note}</p>
            )}
            <p className="text-[13px] text-[var(--gray)]">Paid already via GCash or bank transfer? Upload your receipt now so we can confirm it right away.</p>
            <label className="btn-primary w-full cursor-pointer justify-center">
              {uploadingProof ? "Checking…" : "Upload payment proof"}
              <input type="file" accept="image/*" className="hidden" disabled={uploadingProof} onChange={uploadProofNow} />
            </label>
            {proofError && <p className="text-[13px] font-semibold text-rausch">{proofError}</p>}
          </div>
        )}

        <button onClick={() => setStep("done")} className="btn btn-sm mt-4">
          {proofResult ? "Continue" : "I'll pay later"}
        </button>
      </div>
    );
  }

  if (step === "done" && confirmedBookingId && selected) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <div className="mb-3 text-5xl">🎉</div>
        <h1 className="text-[22px] font-extrabold">Booking request received!</h1>
        <p className="mt-2 text-[14px] text-[var(--gray)]">
          {selected.shortName} · {STAY_TYPES[stayType].label} · {peso(selected.quote.total)}
        </p>
        {confirmationNumber && (
          <div className="card mt-5 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Confirmation number</div>
            <div className="mt-1 text-[20px] font-extrabold tracking-wide">{confirmationNumber}</div>
            <p className="mt-1 text-[12.5px] text-[var(--gray)]">Save this — with your email, it signs you back in to manage this booking.</p>
          </div>
        )}
        {proofResult?.status === "auto_approved" ? (
          <p className="mt-4 text-[13.5px] text-teal">✓ {proofResult.note}</p>
        ) : proofResult ? (
          <p className="mt-4 text-[13.5px] text-amber">{proofResult.note}</p>
        ) : paymentType === "down_payment" ? (
          <p className="mt-4 text-[13.5px] text-[var(--gray)]">
            {peso(selected.quote.dpAmount)} down payment still due — {peso(selected.quote.balanceDue)} balance due later. Manage this anytime from My bookings.
          </p>
        ) : (
          <p className="mt-4 text-[13.5px] text-[var(--gray)]">{peso(selected.quote.total)} still due. Manage this anytime from My bookings.</p>
        )}
        <p className="mt-2 text-[13.5px] text-[var(--gray)]">
          You're signed in — we also emailed a confirmation to {email}.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[700px] px-4 py-9 sm:px-6">
      <h1 className="text-[22px] font-extrabold tracking-tight">Book your stay</h1>

      {(step === "search" || step === "select") && (
        <form onSubmit={search} className="card mt-5 space-y-4 p-5">
          <div className="flex flex-wrap gap-1.5">
            {(["Daycation", "Night", "Full", "Flexible"] as StayType[]).map((st) => (
              <Pill key={st} on={stayType === st} onClick={() => setStayType(st)}>{STAY_TYPES[st].label}</Pill>
            ))}
          </div>
          <div className={`grid gap-3 ${stayType === "Daycation" || stayType === "Flexible" ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="min-w-0">
              <label htmlFor="book-checkin" className="field-label">Check-in</label>
              <input id="book-checkin" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className="field-input mt-1 w-full" />
            </div>
            {stayType === "Night" && (
              <div className="min-w-0">
                <label htmlFor="book-checkout" className="field-label">Check-out</label>
                <input id="book-checkout" type="date" disabled value={checkOutDate} className="field-input mt-1 w-full disabled:opacity-60" />
                <p className="mt-1 text-[11px] text-[var(--gray)]">Night stay is always 1 night</p>
              </div>
            )}
            {stayType === "Full" && (
              <div className="min-w-0">
                <label htmlFor="book-checkout" className="field-label">Check-out</label>
                <input id="book-checkout" type="date" required min={date ? nextDay(date) : undefined} value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} className="field-input mt-1 w-full" />
              </div>
            )}
          </div>
          {stayType === "Flexible" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor="book-checkin-time" className="field-label">Check-in time</label>
                <input id="book-checkin-time" type="time" required value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className="field-input mt-1 w-full" />
              </div>
              <div className="min-w-0">
                <label htmlFor="book-checkout-time" className="field-label">Check-out time</label>
                <input id="book-checkout-time" type="time" required value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className="field-input mt-1 w-full" />
              </div>
              <p className="col-span-2 text-[11px] text-[var(--gray)]">Same day only — pick any time range that works for you.</p>
            </div>
          )}
          {error && <p className="text-[13px] font-semibold text-rausch">{error}</p>}
          <button type="submit" disabled={loadingResults} className="btn-primary w-full justify-center">
            {loadingResults ? "Checking…" : "Check availability"}
          </button>
        </form>
      )}

      {step === "select" && (
        <div className="mt-6 space-y-3">
          {results.map((r) => (
            <div key={r.unitId} className={`card flex items-center gap-3 p-4 ${!r.available ? "opacity-50" : ""}`}>
              <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-[var(--bg-2)]">
                {r.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photoUrl} alt={r.shortName} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xl">🏠</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold">{r.shortName}</div>
                {r.available ? (
                  <div className="text-[13px] text-[var(--gray)]">
                    {r.quote.discountPct > 0 ? (
                      <>
                        <span className="line-through">{peso(r.quote.standardTotal)}</span>{" "}
                        <span className="font-bold text-rausch">{peso(r.quote.total)} total</span>{" "}
                        <span className="text-[11px] font-bold text-teal">−{r.quote.discountPct}% off</span>
                      </>
                    ) : (
                      `${peso(r.quote.total)} total`
                    )}
                  </div>
                ) : (
                  <div className="text-[13px] text-[var(--gray)]">Not available for these dates</div>
                )}
              </div>
              <button disabled={!r.available} onClick={() => chooseUnit(r)} className="btn-primary flex-none disabled:opacity-40">
                Select
              </button>
            </div>
          ))}
        </div>
      )}

      {step === "details" && selected && (
        <form onSubmit={confirm} className="mt-6 space-y-4">
          <div className="card p-4">
            <div className="font-extrabold">{selected.shortName}</div>
            <div className="text-[13px] text-[var(--gray)]">
              {STAY_TYPES[stayType].label}
              {stayType === "Flexible" ? ` · ${checkInTime}–${checkOutTime}` : ` · ${selected.quote.nights} night${selected.quote.nights === 1 ? "" : "s"}`}
            </div>
            <div className="mt-3 border-t border-[var(--line)] pt-3">
              <RateBreakdown {...selected.quote} />
            </div>
          </div>
          <div className="card space-y-3 p-5">
            <div className="field-label">How would you like to pay?</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentType("down_payment")}
                className={`rounded-xl border p-3 text-left transition ${paymentType === "down_payment" ? "border-rausch bg-rausch/5" : "border-[var(--line)]"}`}
              >
                <div className="text-[13.5px] font-extrabold">Down payment</div>
                <div className="text-[12.5px] text-[var(--gray)]">{peso(selected.quote.dpAmount)} now · {peso(selected.quote.balanceDue)} balance due later</div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("full")}
                className={`rounded-xl border p-3 text-left transition ${paymentType === "full" ? "border-rausch bg-rausch/5" : "border-[var(--line)]"}`}
              >
                <div className="text-[13.5px] font-extrabold">Full payment</div>
                <div className="text-[12.5px] text-[var(--gray)]">{peso(selected.quote.total)} now · nothing due later</div>
              </button>
            </div>
          </div>
          <div className="card space-y-4 p-5">
            <div>
              <label htmlFor="guest-name" className="field-label">Full name</label>
              <input id="guest-name" required value={name} onChange={(e) => setName(e.target.value)} className="field-input mt-1" />
            </div>
            <div>
              <label htmlFor="guest-email" className="field-label">Email</label>
              <input id="guest-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field-input mt-1" />
            </div>
            <div>
              <label htmlFor="guest-phone" className="field-label">Contact number</label>
              <input id="guest-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input mt-1" />
            </div>
            <div>
              <label htmlFor="guest-pax" className="field-label">Number of guests</label>
              <input id="guest-pax" type="number" min={1} value={pax} onChange={(e) => setPax(e.target.value)} className="field-input mt-1" />
            </div>
            <div>
              <label htmlFor="guest-special-request" className="field-label">Special requests (optional)</label>
              <textarea id="guest-special-request" value={specialRequest} onChange={(e) => setSpecialRequest(e.target.value)} maxLength={1000} className="field-input mt-1" rows={3} />
            </div>
          </div>
          {error && <p className="text-[13px] font-semibold text-rausch">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting ? "Confirming…" : "Confirm booking"}
          </button>
        </form>
      )}
    </div>
  );
}
