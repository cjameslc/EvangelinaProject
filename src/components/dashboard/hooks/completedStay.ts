import { getOccupiedWindow } from "@/lib/stayRange";
import type { Booking } from "../types";

// A booking's stay counts as "completed" once its checkout has passed —
// same rule the Elite Booker Challenge uses (src/lib/gamification.ts,
// duplicated here rather than imported since that module pulls in the
// server-only Prisma client). Realized profit below only ever counts
// revenue from stays that have actually happened, not future reservations
// just because a downpayment came in.
//
// Uses the real occupied-window end (stayRange.ts's getOccupiedWindow —
// checkOutTime, or the stay type/Airbnb-aware default when it's unset),
// not a naive comparison against checkOutDate's stored midnight-UTC value.
// That naive version flagged a stay "completed" as soon as UTC rolled over
// past midnight on the checkout's calendar day — for a Daycation checking
// out 8pm Manila (noon UTC), that's a 12-hour window where the guest is
// still actively there but Realized Profit already counted their booking
// as fully realized revenue.
export function isCompletedStay(b: Booking): boolean {
  const window = getOccupiedWindow({
    stayType: b.stayType,
    date: new Date(b.date),
    checkOutDate: b.checkOutDate ? new Date(b.checkOutDate) : null,
    checkInTime: b.checkInTime,
    checkOutTime: b.checkOutTime,
    platform: b.platform,
  });
  return window.end.getTime() <= Date.now();
}
