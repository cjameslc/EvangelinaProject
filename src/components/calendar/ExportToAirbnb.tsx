"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { formatUnitDisplay } from "@/lib/format";

type UnitLite = { id: string; unitNumber: string; shortName: string; icalToken?: string | null };

/**
 * The other half of the Airbnb sync loop from SyncHistory (which only
 * covers Airbnb → this app). This app has no write access to Airbnb's
 * API — the only mechanism any PMS uses to keep an Airbnb listing's
 * calendar in sync with bookings made elsewhere (TikTok, Direct, Facebook)
 * is Airbnb periodically pulling an .ics URL you give it. This panel is
 * where that URL lives per unit, so "does Airbnb know about my TikTok
 * booking" has an answer that isn't buried in Admin → Units.
 */
export function ExportToAirbnb({ units }: { units: UnitLite[] }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const withToken = units.filter((u) => u.icalToken);

  async function copyLink(unit: UnitLite) {
    const url = `${window.location.origin}/api/ical/${unit.icalToken}.ics`;
    try {
      await navigator.clipboard.writeText(url);
      toast(`Export link copied — ${unit.shortName} ✓`);
    } catch {
      toast("Couldn't copy — select and copy the link manually.", true);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="export-to-airbnb-panel"
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[11.5px] font-bold text-[var(--gray)]">Export to Airbnb</span>
          <span className="text-[11px] text-[var(--gray)]">
            {withToken.length} of {units.length} unit{units.length === 1 ? "" : "s"} ready — keeps Airbnb blocked on TikTok/Direct bookings
          </span>
        </span>
        <ChevronDownIcon className={cn("h-3.5 w-3.5 flex-none text-[var(--gray)] transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div id="export-to-airbnb-panel" className="border-t border-[var(--line)] px-4 py-3">
          <p className="mb-3 text-[12px] text-[var(--gray)]">
            Airbnb has no API for other apps to push bookings to it — every PMS instead gives Airbnb a link it checks on its own schedule.
            Paste a unit&rsquo;s link below into that unit&rsquo;s Airbnb listing under <span className="font-semibold text-[var(--ink)]">Calendar → Availability → Sync calendars → Import calendar</span>,
            once. From then on it&rsquo;s live and automatic — every booking logged here (any platform) blocks that date on Airbnb with no further action on your end.
          </p>
          <div className="space-y-2">
            {withToken.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] p-2.5">
                <span className="w-[140px] flex-none truncate text-[12.5px] font-extrabold">{formatUnitDisplay(u.unitNumber, u.shortName)}</span>
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/ical/${u.icalToken}.ics`}
                  onFocus={(e) => e.currentTarget.select()}
                  className="field-input min-w-[220px] flex-1 !py-1.5 font-mono text-[11.5px]"
                />
                <button type="button" onClick={() => copyLink(u)} className="btn-sm btn flex-none">Copy</button>
              </div>
            ))}
            {withToken.length < units.length && (
              <p className="text-[11.5px] text-[var(--gray)]">
                {units.length - withToken.length} unit{units.length - withToken.length === 1 ? "" : "s"} without a link yet — open Admin → Units to generate one.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
