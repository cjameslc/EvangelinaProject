"use client";

import { guestJourneyStage, type GuestJourneyStage } from "@/lib/bookingStatus";
import { fmtTimeStr } from "@/lib/format";

type TimelineBooking = {
  date: string;
  checkOutDate: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
};

const STEPS: { key: GuestJourneyStage; label: string }[] = [
  { key: "before_stay", label: "Before Stay" },
  { key: "check_in_day", label: "Check-in" },
  { key: "during_stay", label: "During Stay" },
  { key: "checkout_day", label: "Checkout" },
  { key: "completed", label: "Completed" },
];

/** Simple day-count, matching the exact math the old per-page stayStatus()
 * used — kept here rather than in bookingStatus.ts since it's UI copy, not
 * a stage decision. */
function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / 86400000);
}

export function JourneyTimeline({ booking }: { booking: TimelineBooking }) {
  const now = new Date();
  const stage = guestJourneyStage(booking, now);

  if (stage === "cancelled") {
    return (
      <div className="card mt-3 flex items-center gap-2 p-4 text-[13.5px] font-bold text-[var(--gray)]">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--gray)]" /> This booking was cancelled
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === stage);
  const checkIn = new Date(booking.date);
  const checkOut = booking.checkOutDate ? new Date(booking.checkOutDate) : checkIn;

  let subtext = "";
  if (stage === "before_stay") {
    const days = Math.max(0, daysUntil(checkIn, now));
    subtext = days === 0 ? "Arriving today" : `${days} day${days === 1 ? "" : "s"} until check-in`;
  } else if (stage === "check_in_day") {
    subtext = fmtTimeStr(booking.checkInTime) ? `Check-in from ${fmtTimeStr(booking.checkInTime)}` : "Check-in day";
  } else if (stage === "during_stay") {
    const nights = daysUntil(checkOut, now);
    subtext = `${nights} night${nights === 1 ? "" : "s"} left`;
  } else if (stage === "checkout_day") {
    subtext = fmtTimeStr(booking.checkOutTime) ? `Check out by ${fmtTimeStr(booking.checkOutTime)}` : "Checkout day";
  } else if (stage === "completed") {
    subtext = "Thanks for staying with us";
  }

  return (
    <div className="card mt-3 p-4">
      <div className="flex items-center justify-between">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={step.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={
                    active
                      ? "grid h-6 w-6 place-items-center rounded-full bg-rausch text-[11px] font-extrabold text-white"
                      : done
                        ? "grid h-6 w-6 place-items-center rounded-full bg-green text-[11px] font-extrabold text-white"
                        : "grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--line)] text-[11px] font-bold text-[var(--gray)]"
                  }
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={active ? "text-[10px] font-extrabold text-rausch" : done ? "text-[10px] font-bold text-green" : "text-[10px] font-semibold text-[var(--gray)]"}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && <div className={done ? "mx-1 h-0.5 flex-1 bg-green" : "mx-1 h-0.5 flex-1 bg-[var(--line)]"} />}
            </div>
          );
        })}
      </div>
      {subtext && <p className="mt-3 text-center text-[12.5px] font-bold text-[var(--gray)]">{subtext}</p>}
    </div>
  );
}
