"use client";

import { useEffect, useState } from "react";
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

/** Auto-reveals the WiFi credentials from the guest's own session — no
 * re-typed booking ID (see /api/guest/wifi's comment: booking ID is
 * validated once at sign-in, every guest module unlocks automatically from
 * there). Fetches once on mount; a real 401/403 (session expired, no
 * active stay) shows its own message rather than a form to retry typing
 * anything. */
export function SecureWifiCard({ bookingId }: { bookingId?: string } = {}) {
  const { copiedKey, copy } = useCopy();
  const [revealed, setRevealed] = useState<{ ssid: string; password: string; unitName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/guest/wifi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error ?? "Couldn't load your WiFi details."); return; }
        setRevealed(data);
      } catch {
        if (!cancelled) setError("Something went wrong — please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (!revealed) return;
    let cancelled = false;
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(wifiQrPayload(revealed.ssid, revealed.password), { margin: 1, width: 220 }))
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [revealed]);

  if (loading) {
    return <div className="rounded-xl border border-[var(--line)] p-4 text-[12.5px] font-semibold text-[var(--gray)]">Loading your WiFi details…</div>;
  }

  if (!revealed) {
    return (
      <div className="rounded-xl border border-[var(--line)] p-4">
        <p className="text-[12.5px] font-bold text-rausch">{error ?? "Couldn't load your WiFi details."}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 space-y-2">
        <button onClick={() => copy("ssid", revealed.ssid)} className="block w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-2)]">
          <div className="text-[10.5px] font-bold text-[var(--gray)]">Network</div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold">{revealed.ssid}</span>
            <span className="text-[11px] font-bold text-rausch">{copiedKey === "ssid" ? "Copied ✓" : "Copy"}</span>
          </div>
        </button>
        <button onClick={() => copy("password", revealed.password)} className="block w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-2)]">
          <div className="text-[10.5px] font-bold text-[var(--gray)]">Password</div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold tracking-wide">{revealed.password}</span>
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

/** Auto-reveals the door code from the guest's own session — no re-typed
 * booking ID (see /api/guest/door-code's comment: booking ID is validated
 * once at sign-in, every guest module unlocks automatically from there).
 * Fetches once on mount. */
export function SecureDoorCodeCard({ bookingId }: { bookingId?: string } = {}) {
  const { copiedKey, copy } = useCopy();
  const [revealed, setRevealed] = useState<{ doorCode: string; unitName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/guest/door-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error ?? "Couldn't load your door code."); return; }
        setRevealed(data);
      } catch {
        if (!cancelled) setError("Something went wrong — please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (loading) {
    return <div className="rounded-xl border border-[var(--line)] p-4 text-[12.5px] font-semibold text-[var(--gray)]">Loading your door code…</div>;
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
    <div className="rounded-xl border border-[var(--line)] p-4">
      <p className="text-[12.5px] font-bold text-rausch">{error ?? "Couldn't load your door code."}</p>
    </div>
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
