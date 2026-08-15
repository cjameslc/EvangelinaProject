"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";

type RevealResult = {
  id: string | null;
  code: string | null;
  codeSource: "dynamic" | "static" | null;
  validUntil: string | null;
  unitName: string;
  unitNumber: string;
  wifiSsid: string | null;
  wifiPassword: string | null;
  checkInInstructions: string | null;
  confirmationNumber: string | null;
};

/** A ready-to-send guest message — door code, room, WiFi, and (when one
 * exists) a link to their own guest-portal booking page, together, not
 * four separate things a booker has to assemble by hand. The booker's
 * actual job here is handing a guest everything they need to check
 * themselves in over Messenger/SMS, not reading fields off a screen one at
 * a time. Only includes what's actually available for this booking (a
 * unit with no WiFi set simply omits that section) — never a placeholder.
 *
 * The link itself signs the guest in — it doesn't point at
 * /my-bookings/[id] directly (that page requires a signed-in guest
 * session), it points at /b/{confirmationNumber} (src/app/b/[cn]/route.ts),
 * which verifies the confirmationNumber carried in the URL and mints the
 * guest's session server-side before redirecting to their booking. So the
 * guest taps the link and just sees their details, no login form, nothing
 * to type — the confirmationNumber in the URL *is* the credential, the
 * same one confirmation-number login already treats as sufficient, just
 * carried in the link instead of typed into a form. Deliberately just
 * /b/{cn} and not /b/{bookingId}/{cn} — a confirmationNumber is already
 * unique per booking, so a separate bookingId in the URL was dead weight.
 *
 * Confirmed for real: a booking with no confirmationNumber (every
 * Airbnb-platform booking in this app has one) has no way for that guest
 * to ever sign into /my-bookings/[id] — getGuestBookingForGuide matches on
 * guest.id, and there's no path to become that guest without either a
 * confirmation number or an existing portal account. Promising a link
 * that 404s is worse than not offering one, so it's only included when
 * r.confirmationNumber is real — see the "Generate booking link" action
 * below for how an Owner/Admin can make one exist.
 *
 * Plain text with emoji section markers, not literal Markdown (##, **,
 * backticks) — Messenger/SMS render neither, so a "**Wi-Fi:**" would show
 * up to the guest as literal asterisks. `bookingLink` is resolved by the
 * caller (copyMessage below) before this runs — the /b/{cn} short link
 * (src/app/b/[cn]/route.ts) built from `window.location.origin`, so it's
 * automatically correct on whichever environment this was copied from. */
function guestMessage(r: RevealResult, guestName: string | undefined, bookingLink: string | null): string {
  const greeting = guestName ? `Hi ${guestName}! 👋` : "Hi! 👋";
  const sections = [greeting];

  if (r.wifiSsid) {
    sections.push(
      [
        "📶 Wi-Fi",
        "Stay connected during your stay.",
        `Wi-Fi: ${r.wifiSsid}`,
        r.wifiPassword ? `Password: ${r.wifiPassword}` : null,
      ].filter(Boolean).join("\n")
    );
  }

  const stayLines = [
    "🏡 Your Stay",
    `Welcome to Unit ${r.unitNumber}${r.unitName ? ` — ${r.unitName}` : ""}.`,
  ];
  if (r.code) stayLines.push(`🔐 Door code: ${r.code}${r.validUntil ? ` (valid until ${fmtTime(r.validUntil)})` : ""}`);
  if (r.confirmationNumber) stayLines.push(`Booking ID: ${r.confirmationNumber}`);
  sections.push(stayLines.join("\n"));

  if (bookingLink) {
    sections.push(
      [
        "🔗 View Your Booking",
        bookingLink,
        "This link has your full check-in info, Wi-Fi, house rules, and stay updates.",
      ].join("\n")
    );
  }

  if (r.checkInInstructions) sections.push(r.checkInInstructions);

  sections.push("We hope you have a comfortable and relaxing stay. If you need anything, feel free to contact us anytime. – Evangelina's Staycation");

  return sections.join("\n\n");
}

/** Staff-facing reveal for a booking's door code, WiFi, and room info —
 * every view/copy funnels through the Access Control Service's own API
 * (src/lib/access/service.ts + this route) so it's logged there, never
 * read off any bulk booking/unit payload. Shared across every surface
 * that shows a booking's detail (the per-unit Calendar's popover, the
 * main Calendar's detail modal, the Bookings row) rather than
 * reimplemented per surface. */
export function DoorCodeReveal({
  bookingId, accentClassName = "text-rausch", guestName, canGenerateLink = false,
}: {
  bookingId: string;
  accentClassName?: string;
  /** First name (or full name) shown in the copied message's greeting — omit for a generic "Hi!" when a surface doesn't have it handy. */
  guestName?: string;
  /** Owner/Admin only — POST /api/bookings/[id]/confirmation ("regenerate") is gated server-side to OWNER_ADMIN, narrower than the general reveal permission, so this needs its own explicit flag from the caller rather than being inferred from canRevealAccessCredential. */
  canGenerateLink?: boolean;
}) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; result: RevealResult | null; copied: boolean; generatingLink: boolean }>({
    loading: false, error: null, result: null, copied: false, generatingLink: false,
  });

  async function reveal() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/access/credential/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reveal.");
      setState((s) => ({ ...s, loading: false, error: null, result: data, copied: false }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Failed to reveal." }));
    }
  }

  async function generateLink() {
    setState((s) => ({ ...s, generatingLink: true }));
    try {
      const res = await fetch(`/api/bookings/${bookingId}/confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate a booking link.");
      setState((s) => (s.result ? { ...s, generatingLink: false, result: { ...s.result, confirmationNumber: data.confirmationNumber } } : { ...s, generatingLink: false }));
    } catch {
      setState((s) => ({ ...s, generatingLink: false }));
    }
  }

  async function copyMessage() {
    if (!state.result) return;
    const bookingLink = state.result.confirmationNumber
      ? `${window.location.origin}/b/${encodeURIComponent(state.result.confirmationNumber)}`
      : null;
    const message = guestMessage(state.result, guestName, bookingLink);
    await navigator.clipboard.writeText(message).catch(() => {});
    setState((s) => ({ ...s, copied: true }));
    // "sent" (not "copied") — this is specifically the guest-facing
    // message, composed to be pasted straight into Messenger/SMS, not an
    // internal copy of the raw code for some other purpose. No-ops
    // server-side (logged, not re-revealed) when there's no dynamic
    // credential id — a static-doorCode-only reveal was already logged by
    // the API route itself.
    if (state.result.id) {
      fetch("/api/access/credential/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: state.result.id, action: "sent", channel: "clipboard" }),
      }).catch(() => {});
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
      <span className="text-[var(--gray)]">Door code &amp; WiFi</span>
      {state.result ? (
        <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
          {state.result.code && <span className="font-mono font-bold tracking-wider text-[var(--ink)]">{state.result.code}</span>}
          {!state.result.code && !state.result.wifiSsid && <span className="text-[12px] text-[var(--gray)]">Nothing set for this unit yet</span>}
          {!state.result.confirmationNumber && canGenerateLink && (
            <button onClick={generateLink} disabled={state.generatingLink} className="text-[11.5px] font-bold text-[var(--gray)] hover:underline disabled:opacity-50" title="This booking has no booking-ID link yet — generate one so the guest's link actually works">
              {state.generatingLink ? "Generating link…" : "+ Booking link"}
            </button>
          )}
          <button onClick={copyMessage} className={cn("text-[11.5px] font-bold hover:underline", accentClassName)} title="Copy a ready-to-send message for the guest (code, WiFi, room info, and their booking link if one exists)">
            {state.copied ? "Copied message ✓" : "Copy for guest"}
          </button>
        </span>
      ) : (
        <button onClick={reveal} disabled={state.loading} className={cn("text-[12.5px] font-bold hover:underline disabled:opacity-50", accentClassName)}>
          {state.loading ? "Revealing…" : state.error ? "No code — retry" : "Reveal"}
        </button>
      )}
    </div>
  );
}
