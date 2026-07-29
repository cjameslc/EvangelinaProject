import { occupiedRange, nightsFor } from "@/lib/stayRange";
import { daysInRange } from "@/lib/analytics/period";

export type OccupancyBooking = {
  unitId: string;
  stayType: string;
  date: string | Date;
  checkOutDate: string | Date | null;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  cancelledAt?: string | Date | null;
};

export type OccupancyBlock = { unitId: string; type: string; date: string | Date; endDate: string | Date | null };

function clippedNights(start: Date, end: Date, periodStart: Date, periodEnd: Date): number {
  const s = start.getTime() > periodStart.getTime() ? start : periodStart;
  const e = end.getTime() < periodEnd.getTime() ? end : periodEnd;
  const ms = e.getTime() - s.getTime();
  return ms > 0 ? ms / 86400000 : 0;
}

export type OccupancyResult = {
  occupiedNights: number;
  maintenanceNights: number;
  cleaningNights: number;
  availableNights: number;
  occupancyPct: number;
};

/**
 * Real occupancy from actual date ranges, not a booking-count/flat-days
 * approximation. `bookings` should already be scoped to the unit(s) and
 * roughly overlapping the period (a wider window is fine — every range gets
 * clipped to [periodStart, periodEnd) here). Cancelled bookings are
 * excluded (a cancelled stay never occupied the room).
 *
 * Only Maintenance blocks reduce `availableNights` — a room out of service
 * genuinely can't be booked. Cleaning/turnover blocks do not: it's still a
 * bookable room, just mid-turnover, matching how real hospitality PMS
 * metrics define "available room-nights". Cleaning nights are still
 * returned separately since they're a real, useful figure on their own.
 */
export function computeOccupancy(params: {
  unitCount: number;
  periodStart: Date;
  periodEnd: Date;
  bookings: OccupancyBooking[];
  maintenanceBlocks: OccupancyBlock[];
  cleaningBlocks: OccupancyBlock[];
}): OccupancyResult {
  const { unitCount, periodStart, periodEnd, bookings, maintenanceBlocks, cleaningBlocks } = params;

  // Deduped per (unit, calendar day) — not a flat sum of each booking's own
  // clippedNights. bookingsConflict() deliberately lets a Daycation and a
  // Night/Full stay share the same unit on the same real calendar day (they
  // occupy different real-timestamp windows, e.g. 8am-8pm vs 9pm-9am); this
  // occupiedRange()-based calculation only has day granularity, so both
  // bookings' whole-day ranges cover that same day. Summed without dedup,
  // that day counted as 2 "occupied nights" against 1 "available night" for
  // that unit that day — a real, confirmed bug that could push reported
  // occupancy above 100%. A unit-day now counts as occupied at most once,
  // matching how occupancyCalendarGrid below already treats it (a Map
  // keyed by day, "booked" set once regardless of how many bookings touch
  // that cell).
  const occupiedDaysByUnit = new Map<string, Set<string>>();
  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
    const s = start.getTime() > periodStart.getTime() ? start.getTime() : periodStart.getTime();
    const e = end.getTime() < periodEnd.getTime() ? end.getTime() : periodEnd.getTime();
    if (e <= s) continue;
    let days = occupiedDaysByUnit.get(b.unitId);
    if (!days) { days = new Set(); occupiedDaysByUnit.set(b.unitId, days); }
    for (let t = s; t < e; t += 86400000) days.add(new Date(t).toISOString().slice(0, 10));
  }
  let occupiedNights = 0;
  for (const days of occupiedDaysByUnit.values()) occupiedNights += days.size;

  const blockNights = (blocks: OccupancyBlock[]) =>
    blocks.reduce((sum, blk) => {
      const start = new Date(blk.date);
      const end = blk.endDate ? new Date(blk.endDate) : new Date(start.getTime() + 86400000);
      return sum + clippedNights(start, end, periodStart, periodEnd);
    }, 0);

  const maintenanceNights = blockNights(maintenanceBlocks);
  const cleaningNights = blockNights(cleaningBlocks);

  const totalNights = unitCount * daysInRange({ start: periodStart, end: periodEnd });
  const availableNights = Math.max(0, Math.round(totalNights - maintenanceNights));
  const occupancyPct = availableNights > 0 ? Math.round((occupiedNights / availableNights) * 100) : 0;

  return {
    occupiedNights: Math.round(occupiedNights),
    maintenanceNights: Math.round(maintenanceNights),
    cleaningNights: Math.round(cleaningNights),
    availableNights,
    occupancyPct,
  };
}

/**
 * Average Daily Rate — revenue ÷ real nights stayed (via nightsFor, so a
 * 3-night Full stay counts as 3 nights of revenue-per-night, not 1 booking).
 * Only counts bookings whose check-in falls within the period, matching how
 * "this period's income" is already recognized elsewhere in this app
 * ((paid ? amount : 0) + dpAmount). Excludes cancellations. Returns whole
 * pesos, 0 when there were no occupied nights to divide by.
 */
export function computeADR(bookings: OccupancyBooking[], periodStart: Date, periodEnd: Date): number {
  let totalCentavos = 0;
  let totalNights = 0;
  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const date = new Date(b.date);
    if (date < periodStart || date >= periodEnd) continue;
    const checkOutDate = b.checkOutDate ? new Date(b.checkOutDate) : null;
    totalNights += nightsFor(b.stayType, date, checkOutDate);
    totalCentavos += ((b.paid ? b.amount : 0) + (b.dpAmount || 0)) * 100;
  }
  return totalNights > 0 ? Math.round(totalCentavos / totalNights / 100) : 0;
}

/** Revenue Per Available Room — revenue ÷ available room-nights for the actual period length (not a hardcoded /7). */
export function computeRevPAR(revenueCentavos: number, availableNights: number): number {
  return availableNights > 0 ? Math.round(revenueCentavos / availableNights / 100) : 0;
}

export type CalendarCellStatus = "booked" | "maintenance" | "cleaning" | "available";
export type CalendarCell = { unitId: string; dateKey: string; status: CalendarCellStatus };

/** Cap on the calendar grid's day span — a year-long grid at 5 units × 365 days is ~1800 cells, unreadable and not worth rendering; the UI shows a "pick a shorter range" message past this instead. */
export const OCCUPANCY_CALENDAR_MAX_DAYS = 92;

/**
 * A unit × day grid for the Occupancy Calendar — one cell per unit per
 * day, status in priority order Booked > Maintenance > Cleaning >
 * Available (a checkout-day cleaning block shouldn't hide that the room
 * was actually occupied that night). `periodStart`/`periodEnd` should
 * already be capped to OCCUPANCY_CALENDAR_MAX_DAYS by the caller.
 */
export function occupancyCalendarGrid(params: {
  unitIds: string[];
  periodStart: Date;
  periodEnd: Date;
  bookings: OccupancyBooking[];
  maintenanceBlocks: OccupancyBlock[];
  cleaningBlocks: OccupancyBlock[];
}): CalendarCell[] {
  const { unitIds, periodStart, periodEnd, bookings, maintenanceBlocks, cleaningBlocks } = params;
  const days = daysInRange({ start: periodStart, end: periodEnd });

  const cellsByUnit = new Map<string, Map<string, CalendarCellStatus>>();
  for (const unitId of unitIds) {
    const dayMap = new Map<string, CalendarCellStatus>();
    for (let i = 0; i < days; i++) {
      const d = new Date(periodStart.getTime() + i * 86400000);
      dayMap.set(d.toISOString().slice(0, 10), "available");
    }
    cellsByUnit.set(unitId, dayMap);
  }

  const markRange = (unitId: string, start: Date, end: Date, status: CalendarCellStatus, priority: CalendarCellStatus[]) => {
    const dayMap = cellsByUnit.get(unitId);
    if (!dayMap) return;
    const s = start.getTime() > periodStart.getTime() ? start : periodStart;
    const e = end.getTime() < periodEnd.getTime() ? end : periodEnd;
    for (let t = s.getTime(); t < e.getTime(); t += 86400000) {
      const key = new Date(t).toISOString().slice(0, 10);
      const current = dayMap.get(key);
      if (current === undefined) continue;
      // Only overwrite if the new status outranks what's already there.
      if (priority.indexOf(status) < priority.indexOf(current)) dayMap.set(key, status);
    }
  };
  const rank: CalendarCellStatus[] = ["booked", "maintenance", "cleaning", "available"];

  for (const b of bookings) {
    if (b.cancelledAt) continue;
    const { start, end } = occupiedRange(b.stayType, new Date(b.date), b.checkOutDate ? new Date(b.checkOutDate) : null);
    markRange(b.unitId, start, end, "booked", rank);
  }
  for (const blk of maintenanceBlocks) {
    const start = new Date(blk.date);
    const end = blk.endDate ? new Date(blk.endDate) : new Date(start.getTime() + 86400000);
    markRange(blk.unitId, start, end, "maintenance", rank);
  }
  for (const blk of cleaningBlocks) {
    const start = new Date(blk.date);
    const end = blk.endDate ? new Date(blk.endDate) : new Date(start.getTime() + 86400000);
    markRange(blk.unitId, start, end, "cleaning", rank);
  }

  const cells: CalendarCell[] = [];
  for (const [unitId, dayMap] of cellsByUnit) {
    for (const [dateKey, status] of dayMap) cells.push({ unitId, dateKey, status });
  }
  return cells;
}
