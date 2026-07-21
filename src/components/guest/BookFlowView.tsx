"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { peso } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";

type StayType = "Daycation" | "Night" | "Full";
type QuoteResult = { unitId: string; shortName: string; unitNumber: string; photoUrl: string | null; available: boolean; quote: { nights: number; total: number } };

export function BookFlowView() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"search" | "select" | "details" | "done">("search");
  const [date, setDate] = useState(searchParams?.get("checkIn") ?? "");
  const [checkOutDate, setCheckOutDate] = useState(searchParams?.get("checkOut") ?? "");
  const [stayType, setStayType] = useState<StayType>("Full");
  const [results, setResults] = useState<QuoteResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [selected, setSelected] = useState<QuoteResult | null>(null);
  const preselectedUnit = searchParams?.get("unit");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pax, setPax] = useState("");
  const [specialRequest, setSpecialRequest] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!date) return;
    setLoadingResults(true);
    setError("");
    const params = new URLSearchParams({ date, stayType });
    if (stayType !== "Daycation" && checkOutDate) params.set("checkOutDate", checkOutDate);
    const res = await fetch(`/api/guest/booking-quote?${params}`);
    const j = await res.json();
    setLoadingResults(false);
    if (!res.ok) { setError(j.error ?? "Couldn't check availability."); return; }
    setResults(j.results);
    setStep("select");
    if (preselectedUnit) {
      const match = j.results.find((r: QuoteResult) => r.unitId === preselectedUnit);
      if (match?.available) chooseUnit(match);
    }
  }

  function chooseUnit(r: QuoteResult) {
    setSelected(r);
    setStep("details");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/guest/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: selected.unitId, date, checkOutDate: stayType === "Daycation" ? null : checkOutDate, stayType,
        name, email, phone, pax: pax || null, specialRequest: specialRequest || null,
      }),
    });
    const j = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(j.error ?? "Couldn't complete the booking."); return; }
    setConfirmedBookingId(j.booking.id);
    // A sign-in link doubles as the booking confirmation channel — the
    // guest now has a real account (created on submit) and a way back in.
    fetch("/api/guest/auth/request-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => {});
    setStep("done");
  }

  useEffect(() => {
    if (date && preselectedUnit && step === "search") search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === "done" && confirmedBookingId && selected) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <div className="mb-3 text-5xl">🎉</div>
        <h1 className="text-[22px] font-extrabold">Booking request received!</h1>
        <p className="mt-2 text-[14px] text-[var(--gray)]">
          {selected.shortName} · {STAY_TYPES[stayType].label} · {peso(selected.quote.total)}
        </p>
        <p className="mt-4 text-[13.5px] text-[var(--gray)]">
          We sent a sign-in link to {email} — use it anytime to view or manage this booking.
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
            {(["Daycation", "Night", "Full"] as StayType[]).map((st) => (
              <Pill key={st} on={stayType === st} onClick={() => setStayType(st)}>{STAY_TYPES[st].label}</Pill>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[160px] flex-1">
              <label htmlFor="book-checkin" className="field-label">Check-in</label>
              <input id="book-checkin" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="field-input mt-1" />
            </div>
            {stayType !== "Daycation" && (
              <div className="min-w-[160px] flex-1">
                <label htmlFor="book-checkout" className="field-label">Check-out</label>
                <input id="book-checkout" type="date" required min={date || undefined} value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} className="field-input mt-1" />
              </div>
            )}
          </div>
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
                <div className="text-[13px] text-[var(--gray)]">{r.available ? `${peso(r.quote.total)} total` : "Not available for these dates"}</div>
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
            <div className="text-[13px] text-[var(--gray)]">{STAY_TYPES[stayType].label} · {peso(selected.quote.total)} total</div>
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
              <textarea id="guest-special-request" value={specialRequest} onChange={(e) => setSpecialRequest(e.target.value)} className="field-input mt-1" rows={3} />
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
