// Bookings-page "Opportunity Engine" — pure client-safe logic (no Prisma),
// same discipline as stayRange.ts/pricing/rates.ts: this runs entirely off
// the `bookings`/`units` arrays BookingsView already holds in state, so it
// recomputes automatically via useMemo whenever a booking is created,
// edited, or cancelled — zero extra network requests, and it can never
// disagree with what the page's own agenda list already shows, because
// it's reading the exact same data.
//
// Deliberately does NOT score on "historical demand" — this app has no
// demand-forecasting model, and inventing one would be exactly the kind of
// fabricated number the rest of this codebase avoids. Every signal here is
// real: actual conflict-freeness (bookingsConflict, the same function the
// real booking-creation flow itself uses) and the real same-day booking-
// window cutoffs (isStayTypeBookableNow) already enforced elsewhere.
import { bookingsConflict } from "@/lib/stayRange";
import { quotePrice, type RateTable } from "@/lib/pricing/rates";
import { isStayTypeBookableNow } from "@/lib/bookingEngine/bookingWindow";

export type OpportunityBooking = {
  unitId: string;
  stayType: string;
  date: string; // ISO
  checkOutDate: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  cancelledAt?: string | null;
};

export type SlotStatus = {
  type: "Daycation" | "Night";
  available: boolean; // conflict-free
  bookableNow: boolean; // available AND within today's real booking window
  opensAt: string | null; // "5:00 PM" if available but not yet bookable today
  missedToday: boolean; // available but today's window has already passed
  revenue: number;
};

export type UnitOpportunity = {
  unitId: string;
  unitNumber: string;
  shortName: string;
  daycation: SlotStatus;
  night: SlotStatus;
  potentialRevenue: number; // sum of still-actionable (bookable or upcoming) slots
  slotsOpen: number; // 0, 1, or 2
  score: 1 | 2 | 3 | 4 | 5;
  scoreLabel: string;
};

const SCORE_LABEL: Record<number, string> = { 5: "Excellent", 4: "Good", 3: "Moderate", 2: "Low", 1: "Missed Opportunity" };

function slotStatus(type: "Daycation" | "Night", unitId: string, dateIso: string, bookings: OpportunityBooking[], rates: RateTable, dpFee: number): SlotStatus {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const candidate = { stayType: type, date, checkOutDate: null, checkInTime: null, checkOutTime: null };
  const conflict = bookings.some(
    (b) =>
      b.unitId === unitId &&
      !b.cancelledAt &&
      bookingsConflict(candidate, { stayType: b.stayType, date: new Date(b.date), checkOutDate: b.checkOutDate ? new Date(b.checkOutDate) : null, checkInTime: b.checkInTime, checkOutTime: b.checkOutTime })
  );
  const available = !conflict;
  const bookableNow = available && isStayTypeBookableNow(type, dateIso);
  // Daycation opens at midnight (no lower bound), so the only real
  // "opens later" case is Night before 5pm same-day.
  const missedToday = available && !bookableNow && type === "Daycation";
  const opensAt = available && !bookableNow && type === "Night" ? "5:00 PM" : null;
  const revenue = available ? quotePrice(type, date, null, rates, dpFee).total : 0;
  return { type, available, bookableNow, opensAt, missedToday, revenue };
}

export function computeUnitOpportunity(
  unit: { id: string; unitNumber: string; shortName: string },
  bookings: OpportunityBooking[],
  dateIso: string,
  rates: RateTable,
  dpFee: number
): UnitOpportunity {
  const daycation = slotStatus("Daycation", unit.id, dateIso, bookings, rates, dpFee);
  const night = slotStatus("Night", unit.id, dateIso, bookings, rates, dpFee);
  const slotsOpen = (daycation.available ? 1 : 0) + (night.available ? 1 : 0);
  const anyMissed = daycation.missedToday || night.missedToday;
  const actionableRevenue = (daycation.available && !daycation.missedToday ? daycation.revenue : 0) + (night.available && !night.missedToday ? night.revenue : 0);

  let score: UnitOpportunity["score"];
  if (slotsOpen === 0) score = 1; // fully booked — not really "missed," but nothing to show either
  else if (anyMissed && slotsOpen === 1) score = 1; // the only open slot already missed its window today
  else if (slotsOpen === 2) score = 5;
  else score = 3; // exactly one real, still-actionable slot open

  return {
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    shortName: unit.shortName,
    daycation,
    night,
    potentialRevenue: actionableRevenue,
    slotsOpen,
    score,
    scoreLabel: SCORE_LABEL[score],
  };
}

export function computeOpportunities(
  units: { id: string; unitNumber: string; shortName: string }[],
  bookings: OpportunityBooking[],
  dateIso: string,
  rates: RateTable,
  dpFee: number
): UnitOpportunity[] {
  return units.map((u) => computeUnitOpportunity(u, bookings, dateIso, rates, dpFee));
}
