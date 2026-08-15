"use client";

import { useState } from "react";
import { AvailabilityChat } from "./AvailabilityChat";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type Unit = { id: string; unitNumber: string; shortName: string };

/** Collapsible "Check availability" workspace above the bookings table. */
export function BookingAssistantPanel({
  units, onPrefillBooking,
}: {
  units: Unit[];
  onPrefillBooking: (v: { unitId: string; date: string; stayType: string }) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 pb-3 pt-4 text-left">
        <div>
          <div className="text-[15px] font-extrabold">Booking Assistant</div>
          <div className="text-[12px] text-[var(--gray)]">Check availability before creating a booking.</div>
        </div>
        <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", !open && "-rotate-90")} />
      </button>

      {open && (
        <div className="border-t border-[var(--line)] p-4">
          <AvailabilityChat units={units} onPrefillBooking={onPrefillBooking} />
        </div>
      )}
    </div>
  );
}
