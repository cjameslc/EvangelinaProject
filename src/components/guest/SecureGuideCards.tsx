"use client";

import { useEffect, useState, type FormEvent } from "react";
import { wifiQrPayload } from "@/lib/guideUtils";

/** Copy-to-clipboard with a brief inline "Copied ✓" confirmation — same
 * pattern as GuidebookView/BookingDetailClient, the guest portal has no
 * toast system. Exported so FeedbackFormView's voucher card can reuse it
 * too instead of a third copy of the same hook. */
export function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
    } catch {
      // Clipboard API can be unavailable — the value is still visible
      // on-screen for the guest to select manually.
    }
  }
  return { copiedKey, copy };
}

/** The real WiFi credentials for the guest's active unit — only ever
 * rendered by the caller once it has confirmed there IS an active,
 * non-cancelled booking for this guest (see getActiveGuideBooking). Never
 * receives more than one unit's credentials at a time. */
export function SecureWifiCard({ ssid, password }: { ssid: string; password: string }) {
  const { copiedKey, copy } = useCopy();
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(wifiQrPayload(ssid, password), { margin: 1, width: 220 }))
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ssid, password]);

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 space-y-2">
        <button onClick={() => copy("ssid", ssid)} className="block w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-2)]">
          <div className="text-[10.5px] font-bold text-[var(--gray)]">Network</div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold">{ssid}</span>
            <span className="text-[11px] font-bold text-rausch">{copiedKey === "ssid" ? "Copied ✓" : "Copy"}</span>
          </div>
        </button>
        <button onClick={() => copy("password", password)} className="block w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-2)]">
          <div className="text-[10.5px] font-bold text-[var(--gray)]">Password</div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold tracking-wide">{password}</span>
            <span className="text-[11px] font-bold text-rausch">{copiedKey === "password" ? "Copied ✓" : "Copy"}</span>
          </div>
        </button>
      </div>
      {qr && (
        <div className="flex-none text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Scan to join WiFi" className="h-24 w-24 rounded-lg border border-[var(--line)]" />
          <div className="mt-1 text-[10px] text-[var(--gray)]">Scan to join</div>
        </div>
      )}
    </div>
  );
}

/** Gates the real door code behind re-entering the booking confirmation
 * number — the server never sends the code down until this check passes
 * (see /api/guest/door-code), so there's nothing in the page source to
 * read even before the guest types anything. Each of the 5 units has its
 * own code, so this doubles as a "confirm which stay you mean" step. */
export function SecureDoorCodeCard({ bookingId }: { bookingId?: string } = {}) {
  const { copiedKey, copy } = useCopy();
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [revealed, setRevealed] = useState<{ doorCode: string; unitName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal(e: FormEvent) {
    e.preventDefault();
    if (!confirmationNumber.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guest/door-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationNumber, bookingId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't verify that booking ID."); return; }
      setRevealed(data);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (revealed) {
    return (
      <button
        onClick={() => copy("doorCode", revealed.doorCode)}
        className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3 text-left transition hover:bg-[var(--bg-2)]"
      >
        <div>
          <div className="text-[11px] font-bold text-[var(--gray)]">Your door code — {revealed.unitName}</div>
          <div className="text-[19px] font-extrabold tracking-widest">{revealed.doorCode}</div>
        </div>
        <span className="text-[12.5px] font-bold text-rausch">{copiedKey === "doorCode" ? "Copied ✓" : "Tap to copy"}</span>
      </button>
    );
  }

  return (
    <form onSubmit={reveal} className="rounded-xl border border-[var(--line)] p-4">
      <div className="text-[11px] font-bold text-[var(--gray)]">Enter your booking ID to view your door code</div>
      <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">Sent to you when you booked — e.g. EVA-XXXXXX.</p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={confirmationNumber}
          onChange={(e) => setConfirmationNumber(e.target.value)}
          placeholder="EVA-XXXXXX"
          className="field-input flex-1 uppercase tracking-wide"
          autoCapitalize="characters"
        />
        <button type="submit" disabled={loading} className="btn-primary btn-sm flex-none">{loading ? "Checking…" : "Reveal"}</button>
      </div>
      {error && <p className="mt-2 text-[12px] font-bold text-rausch">{error}</p>}
    </form>
  );
}

/** Shown on WiFi/Check-in/Checkout when the visitor has no active per-unit
 * secrets to see — deliberately shows zero per-unit secrets (no SSID, no
 * code, nothing guessable) either way. `signedIn` only changes the copy: a
 * signed-in guest with no current stay is prompted to book, not to sign in
 * again. */
export function NoActiveStayNotice({ what, signedIn = false }: { what: string; signedIn?: boolean }) {
  return (
    <div className="card p-5 text-center">
      <div className="text-[28px]">🔒</div>
      <p className="mt-2 text-[13.5px] font-bold">
        {signedIn ? `No active stay found for ${what}` : `Sign in to see ${what} for your unit`}
      </p>
      <p className="mt-1 text-[12.5px] text-[var(--gray)]">
        Each unit has its own {what} — we only show yours once we can confirm your active booking.
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {!signedIn && <a href="/guest-login" className="btn-primary btn-sm">Sign in</a>}
        <a href="/book" className="btn btn-sm">Book a unit</a>
      </div>
    </div>
  );
}
