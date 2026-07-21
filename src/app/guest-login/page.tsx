"use client";

import { useState } from "react";

// Minimal for now — Phase C gives the whole guest-facing surface its real
// Airbnb-inspired visual treatment. This page's job today is just to prove
// the passwordless email flow end-to-end.
export default function GuestLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/guest/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "Something went wrong — try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-[calc(100vh-60px)] items-center justify-center px-4 py-14">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.jpg" alt="Evangelina's Staycation" className="h-16 w-16 rounded-2xl object-cover shadow-s" />
          <h1 className="text-2xl font-extrabold tracking-tight">Sign in as a guest</h1>
          <p className="text-sm text-[var(--gray)]">No password — we'll email you a one-tap sign-in link.</p>
        </div>

        {sent ? (
          <div className="card space-y-2 p-6 text-center">
            <p className="text-[15px] font-bold">Check your email</p>
            <p className="text-[13.5px] text-[var(--gray)]">We sent a sign-in link to {email}. It works once and expires in 15 minutes.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card space-y-4 p-6">
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
