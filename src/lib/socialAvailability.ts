// Pure date/occupancy math for the Social Media Center's "Available Dates"
// dashboard — no Prisma import, safe for client components. Reuses the same
// occupiedRange() the real booking-conflict guard (stayRange.ts) and the
// Bookings Schedule grid already use, so "available" here always means the
// exact same thing it means everywhere else in the app — never a second,
// slightly-different definition of occupancy to drift out of sync.
import { occupiedRange } from "@/lib/stayRange";

export type DayAvailability = {
  iso: string; // YYYY-MM-DD
  occupiedUnitIds: string[];
  availableUnitIds: string[];
  status: "available" | "partial" | "full";
};

type MinimalBooking = {
  unitId: string;
  date: string | Date;
  checkOutDate: string | Date | null;
  stayType: string;
  cancelledAt?: string | Date | null;
};
type MinimalUnit = { id: string };

function isoOfUTCDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Per-day occupancy across every unit for a given calendar month.
 * `stayTypeFilter` narrows which bookings count as "occupying" a day — e.g.
 * viewing only Daycation activity to see when the daycation slot (as
 * opposed to the whole unit) is free, matching how the Bookings page's own
 * filters work.
 */
export function computeMonthAvailability(
  units: MinimalUnit[],
  bookings: MinimalBooking[],
  year: number,
  month0: number, // 0-indexed, matches Date's own convention
  stayTypeFilter: string | "all" = "all"
): DayAvailability[] {
  const monthStart = new Date(Date.UTC(year, month0, 1));
  const monthEnd = new Date(Date.UTC(year, month0 + 1, 1));
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000);

  const relevant = bookings.filter((b) => !b.cancelledAt && (stayTypeFilter === "all" || b.stayType === stayTypeFilter));

  const days: DayAvailability[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    const dayStart = new Date(monthStart.getTime() + i * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const occupiedUnitIds = new Set<string>();
    for (const b of relevant) {
      const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
      if (start.getTime() < dayEnd.getTime() && end.getTime() > dayStart.getTime()) occupiedUnitIds.add(b.unitId);
    }
    const availableUnitIds = units.map((u) => u.id).filter((id) => !occupiedUnitIds.has(id));
    const status: DayAvailability["status"] =
      occupiedUnitIds.size === 0 ? "available" : availableUnitIds.length === 0 ? "full" : "partial";
    days.push({ iso: isoOfUTCDate(dayStart), occupiedUnitIds: [...occupiedUnitIds], availableUnitIds, status });
  }
  return days;
}
