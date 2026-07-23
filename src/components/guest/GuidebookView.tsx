"use client";

import { useEffect, useState } from "react";
import { fmtDate, fmtTimeStr } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import type { GuidebookCategory, Amenity } from "@/lib/guidebookContent";
import { mapsSearchUrl, wazeUrl, GRAB_URL, messengerUrl, telUrl, wifiQrPayload, PH_NATIONAL_EMERGENCY_HOTLINE } from "@/lib/guideUtils";
import {
  AmenitiesSection, InsideTheBuildingSection, MeetYourHostSection, MeetOurTeamSection,
  HouseRulesSection, ConciergeEntrySection, NearbyPlacesSection,
} from "@/components/guest/GuidebookSections";
import type { TeamMember } from "@/lib/guidebookService";
import type { PlaceInsightData } from "@/components/guest/PlaceInsightRow";
import { SecureDoorCodeCard } from "@/components/guest/SecureGuideCards";

type GuideBooking = {
  id: string; unitId: string; date: string; checkOutDate: string | null; checkOutTime: string | null; checkInTime: string | null;
  stayType: string; guests: string[]; confirmationNumber: string | null; cancelledAt: string | null;
  checkedInAt: string | null; checkedOutAt: string | null;
  unit: {
    id: string; name: string; shortName: string; unitNumber: string; photoUrl: string | null; location: string;
    wifiSsid: string | null; wifiPassword: string | null; doorCode: string | null; hasDoorCode?: boolean;
    checkInInstructions: string | null; checkOutInstructions: string | null; videoTutorialUrl: string | null;
  };
};
type Guidebook = {
  categories: GuidebookCategory[];
  amenities: Amenity[];
  houseRules: string[];
  contactPhone: string | null;
  emergencyContactPhone: string | null;
  messengerUsername: string | null;
  hostName: string | null;
  hostPhotoUrl: string | null;
  hostBio: string | null;
  team: TeamMember[];
  placeInsights?: Record<string, PlaceInsightData>;
  propertyLat?: number | null;
  propertyLng?: number | null;
};

/** Copy-to-clipboard with a brief inline "Copied ✓" confirmation instead of
 * a toast system — the guest portal has none, matching the existing simple
 * inline-feedback pattern already used in BookingDetailClient. */
function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
    } catch {
      // Clipboard API can be unavailable (non-HTTPS/older WebView) — the
      // value is still visible on-screen for the guest to select manually.
    }
  }
  return { copiedKey, copy };
}

function stayStatus(b: GuideBooking) {
  const now = new Date();
  const checkIn = new Date(b.date);
  const checkOut = b.checkOutDate ? new Date(b.checkOutDate) : checkIn;
  if (b.checkedOutAt) return { label: "Checked out", tone: "text-[var(--gray)]" };
  if (now >= checkOut) return { label: "Stay completed", tone: "text-[var(--gray)]" };
  if (now >= checkIn) return { label: "You're checked in", tone: "text-green" };
  const days = Math.ceil((checkIn.getTime() - now.getTime()) / 86400000);
  if (days <= 0) return { label: "Check-in is today", tone: "text-rausch" };
  return { label: `${days} day${days === 1 ? "" : "s"} until check-in`, tone: "text-[var(--gray)]" };
}

const REQUEST_TYPES: { key: string; label: string; icon: string }[] = [
  { key: "housekeeping", label: "Request housekeeping", icon: "🧹" },
  { key: "late_checkout", label: "Request late checkout", icon: "⏰" },
  { key: "extend_stay", label: "Request to extend stay", icon: "📅" },
  { key: "issue", label: "Report an issue", icon: "⚠️" },
];

export function GuidebookView({ booking, guidebook }: { booking: GuideBooking; guidebook: Guidebook }) {
  const { copiedKey, copy } = useCopy();
  const [wifiQr, setWifiQr] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");

  const status = stayStatus(booking);
  const stayLabel = STAY_TYPES[booking.stayType as keyof typeof STAY_TYPES]?.label ?? booking.stayType;
  const hasWifi = !!(booking.unit.wifiSsid && booking.unit.wifiPassword);

  useEffect(() => {
    if (!hasWifi) return;
    let cancelled = false;
    import("qrcode").then((QRCode) =>
      QRCode.toDataURL(wifiQrPayload(booking.unit.wifiSsid!, booking.unit.wifiPassword!), { margin: 1, width: 220 })
    ).then((url) => { if (!cancelled) setWifiQr(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, [hasWifi, booking.unit.wifiSsid, booking.unit.wifiPassword]);

  async function sendRequest(type: string, label: string) {
    if (requestBusy) return;
    let message: string | null = null;
    if (type === "issue") {
      message = prompt("Briefly describe the issue:");
      if (message === null) return;
      if (!message.trim()) { setRequestError("Please describe the issue."); return; }
    }
    setRequestBusy(type);
    setRequestError("");
    try {
      const res = await fetch(`/api/guest/bookings/${booking.id}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message }),
      });
      if (!res.ok) { const j = await res.json().catch(() => null); setRequestError(j?.error ?? `Couldn't send "${label}".`); return; }
      setRequestSent(type);
      setTimeout(() => setRequestSent((k) => (k === type ? null : k)), 3000);
    } catch {
      setRequestError(`Couldn't send "${label}". Please try again.`);
    } finally {
      setRequestBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      {/* Welcome header */}
      <div className="card overflow-hidden">
        <div className="aspect-[21/9] w-full bg-[var(--bg-2)]">
          {booking.unit.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={booking.unit.photoUrl} alt={booking.unit.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-5xl">🏠</div>
          )}
        </div>
        <div className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-rausch">Welcome to</div>
          <h1 className="mt-0.5 text-[22px] font-extrabold tracking-tight">{booking.unit.name}</h1>
          <p className="text-[13px] text-[var(--gray)]">{booking.unit.location} · Unit {booking.unit.unitNumber}</p>
          <p className={`mt-2 text-[13.5px] font-extrabold ${status.tone}`}>{status.label}</p>
        </div>
      </div>

      {/* Stay timeline */}
      <div className="card mt-3 p-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Your stay</div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[11px] font-bold text-[var(--gray)]">Check-in</div>
            <div className="text-[14.5px] font-extrabold">{fmtDate(booking.date, { month: "short", day: "numeric", timeZone: "UTC" })}</div>
            <div className="text-[12px] text-[var(--gray)]">{fmtTimeStr(booking.checkInTime) ?? "Time not set"}</div>
          </div>
          <div className="h-px flex-1 bg-[var(--line)]" />
          <div className="flex-1 text-right">
            <div className="text-[11px] font-bold text-[var(--gray)]">Check-out</div>
            <div className="text-[14.5px] font-extrabold">{booking.checkOutDate ? fmtDate(booking.checkOutDate, { month: "short", day: "numeric", timeZone: "UTC" }) : "—"}</div>
            <div className="text-[12px] text-[var(--gray)]">{fmtTimeStr(booking.checkOutTime) ?? "Time not set"}</div>
          </div>
        </div>
        <div className="mt-3 text-[12px] text-[var(--gray)]">{stayLabel} · {booking.guests.join(", ")}</div>
      </div>

      {/* Quick actions */}
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        <QuickAction icon="🗺️" label="Maps" href={mapsSearchUrl(`${booking.unit.name} ${booking.unit.location}`)} />
        <QuickAction icon="🚗" label="Waze" href={wazeUrl(`${booking.unit.name} ${booking.unit.location}`)} />
        <QuickAction icon="🚕" label="Grab" href={GRAB_URL} />
        {guidebook.messengerUsername ? (
          <QuickAction icon="💬" label="Message us" href={messengerUrl(guidebook.messengerUsername)} />
        ) : (
          <QuickAction icon="💬" label="Message us" disabled />
        )}
      </div>

      {/* Check-in guide */}
      {(booking.unit.hasDoorCode || booking.unit.checkInInstructions || booking.unit.videoTutorialUrl) && (
        <div className="card mt-3 p-5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🔑 Check-in guide</div>
          {booking.unit.hasDoorCode && <SecureDoorCodeCard bookingId={booking.id} />}
          {booking.unit.checkInInstructions && (
            <p className="mt-3 text-[13.5px] leading-relaxed">{booking.unit.checkInInstructions}</p>
          )}
          {booking.unit.videoTutorialUrl && (
            <a href={booking.unit.videoTutorialUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[13px] font-bold text-rausch hover:underline">
              ▶ Watch the check-in video
            </a>
          )}
        </div>
      )}

      {/* Check-out guide */}
      {booking.unit.checkOutInstructions && (
        <div className="card mt-3 p-5">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🚪 Check-out guide</div>
          <p className="text-[13.5px] leading-relaxed">{booking.unit.checkOutInstructions}</p>
        </div>
      )}

      {/* Emergency */}
      <div className="card mt-3 p-5">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🚨 Emergency</div>
        <div className="flex flex-wrap gap-2">
          <a href={telUrl(PH_NATIONAL_EMERGENCY_HOTLINE)} className="btn btn-sm">📞 National emergency hotline — {PH_NATIONAL_EMERGENCY_HOTLINE}</a>
          {guidebook.emergencyContactPhone && (
            <a href={telUrl(guidebook.emergencyContactPhone)} className="btn btn-sm text-rausch">🏠 Property emergency contact</a>
          )}
        </div>
      </div>

      {/* WiFi */}
      {hasWifi && (
        <div className="card mt-3 p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">📶 WiFi</div>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <button onClick={() => copy("wifiSsid", booking.unit.wifiSsid!)} className="block w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-2)]">
                <div className="text-[10.5px] font-bold text-[var(--gray)]">Network</div>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-extrabold">{booking.unit.wifiSsid}</span>
                  <span className="text-[11px] font-bold text-rausch">{copiedKey === "wifiSsid" ? "Copied ✓" : "Copy"}</span>
                </div>
              </button>
              <button onClick={() => copy("wifiPassword", booking.unit.wifiPassword!)} className="block w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-2)]">
                <div className="text-[10.5px] font-bold text-[var(--gray)]">Password</div>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-extrabold tracking-wide">{booking.unit.wifiPassword}</span>
                  <span className="text-[11px] font-bold text-rausch">{copiedKey === "wifiPassword" ? "Copied ✓" : "Copy"}</span>
                </div>
              </button>
            </div>
            {wifiQr && (
              <div className="flex-none text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wifiQr} alt="Scan to join WiFi" className="h-24 w-24 rounded-lg border border-[var(--line)]" />
                <div className="mt-1 text-[10px] text-[var(--gray)]">Scan to join</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3">
        <AmenitiesSection amenities={guidebook.amenities} />
      </div>
      <div className="mt-3">
        <InsideTheBuildingSection />
      </div>
      <div className="mt-3">
        <MeetYourHostSection hostName={guidebook.hostName} hostPhotoUrl={guidebook.hostPhotoUrl} hostBio={guidebook.hostBio} />
      </div>
      <div className="mt-3">
        <MeetOurTeamSection team={guidebook.team} />
      </div>

      {/* Guest requests */}
      <div className="card mt-3 p-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🙋 Need something?</div>
        <div className="grid grid-cols-2 gap-2.5">
          {REQUEST_TYPES.map((r) => (
            <button
              key={r.key}
              onClick={() => sendRequest(r.key, r.label)}
              disabled={requestBusy === r.key}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2.5 text-left text-[12.5px] font-bold transition hover:bg-[var(--bg-2)] disabled:opacity-60"
            >
              <span className="text-[16px]">{r.icon}</span>
              <span className="flex-1">{requestSent === r.key ? "Sent ✓" : requestBusy === r.key ? "Sending…" : r.label}</span>
            </button>
          ))}
        </div>
        {requestError && <p className="mt-2 text-[12.5px] font-semibold text-rausch">{requestError}</p>}
        {guidebook.contactPhone && (
          <div className="mt-3">
            <a href={telUrl(guidebook.contactPhone)} className="btn btn-sm">📞 Contact host</a>
          </div>
        )}
      </div>

      <div className="mt-3">
        <ConciergeEntrySection />
      </div>

      <div className="mt-5">
        <NearbyPlacesSection
          categories={guidebook.categories}
          insights={guidebook.placeInsights}
          origin={guidebook.propertyLat != null && guidebook.propertyLng != null ? { lat: guidebook.propertyLat, lng: guidebook.propertyLng } : null}
        />
      </div>

      <div className="mt-3">
        <HouseRulesSection houseRules={guidebook.houseRules} />
      </div>

      {booking.confirmationNumber && (
        <div className="mt-6 text-center text-[12px] text-[var(--gray)]">Confirmation {booking.confirmationNumber}</div>
      )}
    </div>
  );
}

function QuickAction({ icon, label, href, disabled }: { icon: string; label: string; href?: string; disabled?: boolean }) {
  const inner = (
    <div className={`card flex flex-col items-center gap-1.5 py-3.5 text-center transition ${disabled ? "opacity-40" : "hover:bg-[var(--bg-2)]"}`}>
      <span className="text-[22px]">{icon}</span>
      <span className="text-[11px] font-bold">{label}</span>
    </div>
  );
  if (disabled || !href) return inner;
  return <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>;
}
