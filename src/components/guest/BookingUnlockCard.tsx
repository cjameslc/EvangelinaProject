"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * A quick-access way to reach WiFi/door-code/booking details right from the
 * guest hub, instead of requiring a trip to /guest-login first. Same real
 * mechanism as that page's "Booking confirmation" tab — email + confirmation
 * number, POSTed to the same rate-limited /api/guest/auth/verify-confirmation
 * endpoint — deliberately not a booking-ID-only shortcut: a confirmation
 * number alone was never meant to be sufficient on its own (see
 * Security.md's no-enumeration/reveal-gate discipline), so this still asks
 * for both, just inline instead of on a separate page.
 */
export function BookingUnlockCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/guest/auth/verify-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, confirmationNumber }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Something went wrong — try again.");
        return;
      }
      router.push("/my-bookings?welcome=1");
      router.refresh();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-auto flex w-full max-w-[420px] items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-3.5 text-[13.5px] font-bold text-[var(--ink)] shadow-s transition hover:-translate-y-0.5 hover:shadow-card"
      >
        🔑 Have a booking? Unlock your WiFi &amp; door code
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto w-full max-w-[420px] space-y-3 p-5 text-left">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] font-extrabold">Enter your booking details</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-bold text-[var(--gray)] hover:text-[var(--ink)]">Cancel</button>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="hub-unlock-email" className="field-label">Email</label>
        <input id="hub-unlock-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" placeholder="you@example.com" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="hub-unlock-conf" className="field-label">Booking ID</label>
        <input
          id="hub-unlock-conf"
          required
          value={confirmationNumber}
          onChange={(e) => setConfirmationNumber(e.target.value)}
          className="field-input uppercase"
          placeholder="EVA-XXXXXX"
        />
        <p className="text-[11.5px] text-[var(--gray)]">Sent to you when you booked — check your confirmation email.</p>
      </div>
      {error && <p className="text-[12.5px] font-semibold text-rausch">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? "Unlocking…" : "Unlock my booking"}
      </button>
    </form>
  );
}
