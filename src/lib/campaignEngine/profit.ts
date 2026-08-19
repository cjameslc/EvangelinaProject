import { collectedAmountPesos, grossAmountPesos } from "@/lib/finance";
import type { BookerTotals, CampaignBooking } from "./types";

/**
 * "Profit generated" per booker for the Sales Championship — deliberately
 * the same collectedAmountPesos() finance.ts uses for every other real
 * money figure in this app (Dashboard income, Analytics revenue, the
 * booker commission gate), not a second, competing formula. There's no
 * per-booking expense to net out at the individual-booker level (expenses
 * aren't attributable to whoever booked the stay), so "profit" here means
 * money actually collected/kept — already correctly zeroed on a refund and
 * still counting a kept deposit on a guest-cancelled booking, exactly as
 * collectedAmountPesos documents. "Revenue generated" is the separate,
 * larger figure (grossAmountPesos — full contract value regardless of
 * paid status) the brief explicitly distinguishes from profit and
 * explicitly excludes from the ranking metric.
 *
 * No cancelledAt filter here on purpose — collectedAmountPesos already
 * encodes the right exclusion rule (zero only on an actual refund), and
 * re-filtering on cancelledAt here would incorrectly zero out a
 * legitimately-kept deposit on a guest-cancelled booking.
 */
export function computeBookerTotals(bookings: CampaignBooking[], employeeIds: string[]): Map<string, BookerTotals> {
  const totals = new Map<string, BookerTotals>();
  for (const id of employeeIds) totals.set(id, { employeeId: id, profitPesos: 0, revenuePesos: 0, bookingCount: 0 });
  for (const b of bookings) {
    if (!b.bookerId) continue;
    const t = totals.get(b.bookerId);
    if (!t) continue; // not a campaign participant this period
    t.profitPesos += collectedAmountPesos(b);
    t.revenuePesos += grossAmountPesos(b);
    t.bookingCount += 1;
  }
  return totals;
}
