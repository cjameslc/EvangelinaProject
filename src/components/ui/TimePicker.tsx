"use client";

import { useEffect, useRef, useState } from "react";
import { ClockIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type Meridiem = "AM" | "PM";

function to12h(hhmm: string): { hour: string; minute: string; meridiem: Meridiem } {
  if (!hhmm) return { hour: "", minute: "", meridiem: "AM" };
  const [h, m] = hhmm.split(":").map(Number);
  const meridiem: Meridiem = h >= 12 ? "PM" : "AM";
  let hour = h % 12;
  if (hour === 0) hour = 12;
  return { hour: String(hour), minute: String(m).padStart(2, "0"), meridiem };
}

function to24h(hour: string, minute: string, meridiem: Meridiem): string {
  let h = parseInt(hour || "12", 10) % 12;
  if (meridiem === "PM") h += 12;
  const m = Math.min(59, Math.max(0, parseInt(minute || "0", 10) || 0));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function displayFormat(hhmm: string): string {
  if (!hhmm) return "";
  const { hour, minute, meridiem } = to12h(hhmm);
  return `${hour}:${minute} ${meridiem}`;
}

/**
 * A native-picker-style "ENTER TIME" popover — big tappable Hour/Minute
 * digit fields plus an AM/PM toggle, Cancel/OK to commit — restyled in the
 * app's own rounded/rausch theme instead of a browser's default
 * `<input type="time">` chrome, matching DateRangePicker's popover pattern.
 */
export function TimePicker({
  value,
  onChange,
  placeholder = "Select time",
  error,
}: {
  /** 24-hour "HH:MM", or "" for unset. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [meridiem, setMeridiem] = useState<Meridiem>("AM");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hourRef = useRef<HTMLInputElement | null>(null);

  function openPanel() {
    const parsed = to12h(value);
    setHour(parsed.hour || "12");
    setMinute(parsed.minute || "00");
    setMeridiem(parsed.meridiem);
    setOpen(true);
  }

  function commit() {
    let h = parseInt(hour || "12", 10);
    if (!h || h < 1) h = 12;
    if (h > 12) h = 12;
    let m = parseInt(minute || "0", 10);
    if (Number.isNaN(m) || m < 0) m = 0;
    if (m > 59) m = 59;
    onChange(to24h(String(h), String(m).padStart(2, "0"), meridiem));
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { hourRef.current?.focus(); hourRef.current?.select(); }, 0);
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Enter") { e.preventDefault(); commit(); }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hour, minute, meridiem]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn("field-input flex w-full items-center justify-between text-left", error && "border-rausch ring-4 ring-rausch/15")}
      >
        <span className={value ? "font-bold" : "text-[var(--gray)]"}>{value ? displayFormat(value) : placeholder}</span>
        <ClockIcon className="h-4 w-4 flex-none text-[var(--gray)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-card">
          <div className="mb-4 text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Enter time</div>

          <div className="flex items-center justify-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <input
                ref={hourRef}
                value={hour}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setHour(e.target.value.replace(/\D/g, "").slice(0, 2))}
                onBlur={() => { let h = parseInt(hour || "12", 10); if (!h || h < 1) h = 12; if (h > 12) h = 12; setHour(String(h)); }}
                inputMode="numeric"
                aria-label="Hour"
                className="h-16 w-16 rounded-2xl border-2 border-rausch bg-rausch/5 text-center text-[28px] font-extrabold text-[var(--ink)] outline-none"
              />
              <span className="text-[11px] font-semibold text-[var(--gray)]">Hour</span>
            </div>
            <div className="pb-6 text-[24px] font-extrabold text-[var(--gray)]">:</div>
            <div className="flex flex-col items-center gap-1.5">
              <input
                value={minute}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setMinute(e.target.value.replace(/\D/g, "").slice(0, 2))}
                onBlur={() => { let m = parseInt(minute || "0", 10); if (Number.isNaN(m)) m = 0; if (m > 59) m = 59; setMinute(String(m).padStart(2, "0")); }}
                inputMode="numeric"
                aria-label="Minute"
                className="h-16 w-16 rounded-2xl bg-[var(--bg-2)] text-center text-[28px] font-extrabold text-[var(--ink)] outline-none"
              />
              <span className="text-[11px] font-semibold text-[var(--gray)]">Minute</span>
            </div>
            <div className="ml-2 flex flex-none flex-col overflow-hidden rounded-xl border border-[var(--line-2)]">
              <button
                type="button"
                onClick={() => setMeridiem("AM")}
                className={cn("px-3.5 py-2 text-[13px] font-bold transition", meridiem === "AM" ? "bg-rausch/15 text-rausch" : "text-[var(--gray)] hover:bg-[var(--bg-2)]")}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setMeridiem("PM")}
                className={cn("border-t border-[var(--line-2)] px-3.5 py-2 text-[13px] font-bold transition", meridiem === "PM" ? "bg-rausch/15 text-rausch" : "text-[var(--gray)] hover:bg-[var(--bg-2)]")}
              >
                PM
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-5 border-t border-[var(--line)] pt-3.5">
            <button type="button" onClick={() => setOpen(false)} className="text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)] hover:text-[var(--ink)]">
              Cancel
            </button>
            <button type="button" onClick={commit} className="text-[13px] font-extrabold uppercase tracking-wide text-rausch hover:opacity-80">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
