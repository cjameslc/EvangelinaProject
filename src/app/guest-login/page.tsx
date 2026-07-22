"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui/Pill";

export default function GuestLoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<"confirmation" | "link">("confirmation");

  // Booking confirmation number login
  const [confEmail, setConfEmail] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [confLoading, setConfLoading] = useState(false);
  const [confError, setConfError] = useState("");

  // Email magic-link login
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmitConfirmation(e: React.FormEvent) {
    e.preventDefault();
    if (confLoading) return;
    setConfLoading(true);
    setConfError("");
    try {
      const res = await fetch("/api/guest/auth/verify-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: confEmail, confirmationNumber }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setConfError(j?.error ?? "Something went wrong — try again.");
        return;
      }
      router.push("/my-bookings");
      router.refresh();
    } catch {
      setConfError("Something went wrong — try again.");
    } finally {
      setConfLoading(false);
    }
  }

  async function onSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/guest/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Something went wrong — try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-60px)] items-center justify-center px-4 py-14">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.jpg" alt="Evangelina's Staycation" className="h-16 w-16 rounded-2xl object-cover shadow-s" />
          <h1 className="text-2xl font-extrabold tracking-tight">Sign in as a guest</h1>
          <p className="text-sm text-[var(--gray)]">No password needed.</p>
        </div>

        <div className="mb-4 flex justify-center gap-1.5">
          <Pill on={method === "confirmation"} onClick={() => setMethod("confirmation")}>Booking confirmation</Pill>
          <Pill on={method === "link"} onClick={() => setMethod("link")}>Email link</Pill>
        </div>

        {method === "confirmation" ? (
          <form onSubmit={onSubmitConfirmation} className="card space-y-4 p-6">
            <div className="space-y-1.5">
              <label htmlFor="guest-login-conf-email" className="field-label">Email</label>
              <input id="guest-login-conf-email" type="email" required value={confEmail} onChange={(e) => setConfEmail(e.target.value)} className="field-input" placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="guest-login-conf-number" className="field-label">Confirmation number</label>
              <input
                id="guest-login-conf-number"
                required
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
                className="field-input uppercase"
                placeholder="EVA-XXXXXX"
              />
              <p className="text-[12px] text-[var(--gray)]">Sent to you when you booked — check your confirmation email or the booking detail screen.</p>
            </div>
            {confError && <p className="text-[13px] font-semibold text-rausch">{confError}</p>}
            <button type="submit" disabled={confLoading} className="btn-primary w-full justify-center">
              {confLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : sent ? (
          <div className="card space-y-2 p-6 text-center">
            <p className="text-[15px] font-bold">Check your email</p>
            <p className="text-[13.5px] text-[var(--gray)]">We sent a sign-in link to {email}. It works once and expires in 15 minutes.</p>
          </div>
        ) : (
          <form onSubmit={onSubmitLink} className="card space-y-4 p-6">
            <p className="text-[13px] text-[var(--gray)]">We'll email you a one-tap sign-in link.</p>
            <div className="space-y-1.5">
              <label htmlFor="guest-login-email" className="field-label">Email</label>
              <input id="guest-login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" placeholder="you@example.com" />
            </div>
            {error && <p className="text-[13px] font-semibold text-rausch">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
