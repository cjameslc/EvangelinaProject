import type { Booking } from "../types";

// A booking's stay counts as "completed" once its checkout has passed —
// same rule the Elite Booker Challenge uses (src/lib/gamification.ts,
// duplicated here rather than imported since that module pulls in the
// server-only Prisma client). Realized profit below only ever counts
// revenue from stays that have actually happened, not future reservations
// just because a downpayment came in.
export function isCompletedStay(b: Booking): boolean {
  const end = new Date(b.checkOutDate ?? b.date);
  return end.getTime() <= Date.now();
}
