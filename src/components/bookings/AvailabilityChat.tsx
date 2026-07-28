"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, manilaDayStart, formatUnitDisplay } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "@/components/ui/Icons";
import { TimePicker } from "@/components/ui/TimePicker";

type Unit = { id: string; unitNumber: string; shortName: string };
const STAY_TYPE_KEYS = ["Daycation", "Night", "Full", "Flexible"] as const;

export type Option = { unitId: string; unit: string; stayType: string; date: string; available: boolean };
export type AvailabilityResult = {
  date: string;
  requested: Option[];
  allAvailable: boolean;
  alternatives: { sameDayOtherOptions: Option[]; nearbyDates: { date: string; available: boolean }[] };
};

type Msg = { id: string; from: "bot" | "user"; content: React.ReactNode };
type Step = "date" | "unit" | "stayType" | "flexTime" | "checking" | "done";

let msgSeq = 0;
function nextId() {
  return `m${msgSeq++}`;
}

/**
 * A guided, chat-styled availability checker for the Bookings page —
 * deterministic, not AI: every answer just narrows the query eventually
 * sent to GET /api/bookings/availability, which runs the exact same
 * bookingsConflict() the real booking-creation guard enforces. The "chat"
 * is a friendlier shell around a 3-question form (date → unit → stay type),
 * ending in a result bubble that offers real, clickable alternatives
 * (another unit, another stay type, or a nearby free date) when the
 * requested slot isn't open.
 */
export function AvailabilityChat({
  units, onPrefillBooking, onResult,
}: {
  units: Unit[];
  onPrefillBooking: (v: { unitId: string; date: string; stayType: string }) => void;
  /** Fired with the raw result of every completed check — lets a sibling
   * panel (Team Collaboration's "Share Availability" quick action) turn
   * the most recent real check into a chat message without re-querying
   * the availability API itself. */
  onResult?: (data: AvailabilityResult, unitLabel: string) => void;
}) {
  const todayIso = manilaDayStart().toISOString().slice(0, 10);
  const [messages, setMessages] = useState<Msg[]>([
    { id: nextId(), from: "bot", content: "Hi! Let's check availability. What date do you have in mind?" },
  ]);
  const [step, setStep] = useState<Step>("date");
  const [date, setDate] = useState(todayIso);
  const [unitId, setUnitId] = useState<string>(""); // "" = any/all units
  const [stayType, setStayType] = useState<string>("");
  const [flexCheckInTime, setFlexCheckInTime] = useState("");
  const [flexCheckOutTime, setFlexCheckOutTime] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function push(from: Msg["from"], content: React.ReactNode) {
    setMessages((m) => [...m, { id: nextId(), from, content }]);
  }

  function unitLabel(id: string) {
    if (!id) return "any unit";
    const u = units.find((x) => x.id === id);
    return u ? formatUnitDisplay(u.unitNumber, u.shortName) : id;
  }

  function submitDate() {
    push("user", fmtDate(date, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }));
    push("bot", "Got it. Check a specific unit, or every unit?");
    setStep("unit");
  }

  function submitUnit(id: string) {
    setUnitId(id);
    push("user", id ? unitLabel(id) : "Any unit");
    push("bot", "And which stay type?");
    setStep("stayType");
  }

  // Shared by the direct stayType path, the Flexible time-entry path, and
  // "try a nearby date" retries — the ONE place that calls
  // GET /api/bookings/availability, so every entry point stays in sync with
  // whatever params that route actually supports (including the Flexible
  // checkInTime/checkOutTime it now accepts).
  async function runCheck(d: string, uId: string, st: string, checkInTime?: string, checkOutTime?: string) {
    push("bot", "Checking…");
    const params = new URLSearchParams({ date: d, stayType: st });
    if (uId) params.set("unitId", uId);
    if (checkInTime) params.set("checkInTime", checkInTime);
    if (checkOutTime) params.set("checkOutTime", checkOutTime);
    const res = await fetch(`/api/bookings/availability?${params}`);
    setMessages((m) => m.slice(0, -1)); // drop the "Checking…" placeholder
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      push("bot", j?.error ?? "Couldn't check availability — try again.");
      setStep("done");
      return;
    }
    const data: AvailabilityResult = await res.json();
    push(
      "bot",
      <ResultBubble
        data={data}
        unitIdRequested={uId}
        onPrefillBooking={onPrefillBooking}
        onRetryDate={(dd) => { setDate(dd); runFullCheck(dd, uId, st, checkInTime, checkOutTime); }}
      />
    );
    setStep("done");
    onResult?.(data, unitLabel(uId));
  }

  async function submitStayType(st: string) {
    setStayType(st);
    push("user", STAY_TYPES[st as keyof typeof STAY_TYPES]?.label ?? st);
    if (st === "Flexible") {
      push("bot", "What check-in and check-out time?");
      setStep("flexTime");
      return;
    }
    setStep("checking");
    await runCheck(date, unitId, st);
  }

  async function submitFlexTime() {
    push("user", `${flexCheckInTime} – ${flexCheckOutTime}`);
    setStep("checking");
    await runCheck(date, unitId, "Flexible", flexCheckInTime, flexCheckOutTime);
  }

  // Used when clicking a "nearby date" suggestion — re-runs the whole check
  // against that new date without needing to walk through the questions again.
  async function runFullCheck(d: string, uId: string, st: string, checkInTime?: string, checkOutTime?: string) {
    push("user", `Try ${fmtDate(d, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} instead`);
    await runCheck(d, uId, st, checkInTime, checkOutTime);
  }

  function startOver() {
    setMessages([{ id: nextId(), from: "bot", content: "Sure — what date do you have in mind?" }]);
    setStep("date");
    setUnitId("");
    setStayType("");
    setFlexCheckInTime("");
    setFlexCheckOutTime("");
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--line)]">
      <div ref={scrollRef} className="max-h-[420px] min-h-[160px] space-y-2.5 overflow-y-auto bg-[var(--bg-2)] p-4">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug",
                m.from === "user" ? "bg-rausch text-white" : "border border-[var(--line)] bg-[var(--card)]"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--line)] bg-[var(--card)] p-3.5">
        {step === "date" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:min-w-0 sm:flex-1">
              <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gray)]" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input w-full py-2 pl-8 text-[13px]" />
            </div>
            <button onClick={submitDate} className="btn-primary btn-sm w-full sm:w-auto sm:flex-none">Next</button>
          </div>
        )}

        {step === "unit" && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => submitUnit("")} className="pill">Any unit</button>
            {units.map((u) => (
              <button key={u.id} onClick={() => submitUnit(u.id)} className="pill">{u.unitNumber} · {u.shortName}</button>
            ))}
          </div>
        )}

        {step === "stayType" && (
          <div className="flex flex-wrap gap-1.5">
            {STAY_TYPE_KEYS.map((st) => (
              <button key={st} onClick={() => submitStayType(st)} className="pill">
                {STAY_TYPES[st].label} <span className="text-[10.5px] opacity-70">({STAY_TYPES[st].hrs})</span>
              </button>
            ))}
          </div>
        )}

        {step === "flexTime" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <TimePicker value={flexCheckInTime} onChange={setFlexCheckInTime} placeholder="Check-in" />
            <TimePicker value={flexCheckOutTime} onChange={setFlexCheckOutTime} placeholder="Check-out" />
            <button
              onClick={submitFlexTime}
              disabled={!flexCheckInTime || !flexCheckOutTime}
              className="btn-primary btn-sm w-full disabled:opacity-50 sm:w-auto sm:flex-none"
            >
              Check
            </button>
          </div>
        )}

        {step === "checking" && <p className="text-[12.5px] text-[var(--gray)]">Checking…</p>}

        {step === "done" && (
          <button onClick={startOver} className="btn btn-sm">Check another date</button>
        )}
      </div>
    </div>
  );
}

function ResultBubble({
  data, unitIdRequested, onPrefillBooking, onRetryDate,
}: {
  data: AvailabilityResult;
  unitIdRequested: string;
  onPrefillBooking: (v: { unitId: string; date: string; stayType: string }) => void;
  onRetryDate: (date: string) => void;
}) {
  if (data.allAvailable) {
    return (
      <div className="space-y-2">
        <div className="font-bold text-green">✅ {data.requested.length === 1 ? "Available!" : "All available!"}</div>
        <div className="space-y-1.5">
          {data.requested.map((r) => (
            <div key={`${r.unitId}-${r.stayType}`} className="flex items-center justify-between gap-2 rounded-lg bg-green/10 px-2.5 py-1.5">
              <span className="text-[12.5px] font-semibold">{r.unit} · {STAY_TYPES[r.stayType as keyof typeof STAY_TYPES]?.label}</span>
              <button
                onClick={() => onPrefillBooking({ unitId: r.unitId, date: r.date, stayType: r.stayType })}
                className="flex-none rounded-lg bg-green px-2.5 py-1 text-[11.5px] font-bold text-white hover:brightness-95"
              >
                Log this booking
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { sameDayOtherOptions, nearbyDates } = data.alternatives;
  return (
    <div className="space-y-2.5">
      <div className="font-bold text-rausch">
        ❌ {unitIdRequested ? "That unit isn't available" : sameDayOtherOptions.length > 0 ? "That combination isn't available, but other units are free" : "Nothing free"} on {fmtDate(data.date, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}.
      </div>

      {sameDayOtherOptions.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">✅ Available that same day</div>
          <div className="space-y-1.5">
            {sameDayOtherOptions.map((r) => (
              <div key={`${r.unitId}-${r.stayType}`} className="flex items-center justify-between gap-2 rounded-lg bg-green/10 px-2.5 py-1.5">
                <span className="text-[12.5px] font-semibold">{r.unit} · {STAY_TYPES[r.stayType as keyof typeof STAY_TYPES]?.label}</span>
                <button
                  onClick={() => onPrefillBooking({ unitId: r.unitId, date: r.date, stayType: r.stayType })}
                  className="flex-none rounded-lg bg-green px-2.5 py-1 text-[11.5px] font-bold text-white hover:brightness-95"
                >
                  Log this booking
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {nearbyDates.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Same unit &amp; stay type, nearby dates</div>
          <div className="flex flex-wrap gap-1.5">
            {nearbyDates.map((n) => (
              <button key={n.date} onClick={() => onRetryDate(n.date)} className="pill">
                {fmtDate(n.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}
              </button>
            ))}
          </div>
        </div>
      )}

      {sameDayOtherOptions.length === 0 && nearbyDates.length === 0 && (
        <p className="text-[12.5px] text-[var(--gray)]">No nearby alternatives found either — try a different date or unit above.</p>
      )}
    </div>
  );
}
