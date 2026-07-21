import { prisma } from "@/lib/prisma";

/**
 * Thin wrapper around the same CalendarBlock table every internal calendar
 * view already reads (/calendar, Housekeeping's schedule, Dashboard) — the
 * guest-facing date picker (Phase C) uses this too, so there is one
 * underlying data source for "what's occupied," not a second copy.
 */
export async function getUnitOccupiedRanges(unitId: string, from: Date, to: Date) {
  return prisma.calendarBlock.findMany({
    where: { unitId, date: { lt: to }, OR: [{ endDate: null }, { endDate: { gt: from } }] },
    select: { date: true, endDate: true, type: true },
    orderBy: { date: "asc" },
  });
}

/**
 * Guest-safe projection — a public date picker only ever needs to know
 * which dates are blocked, never who's staying, for how much, or any
 * internal note. Deliberately excludes `guest`/`note`/`status`/`bookingId`.
 */
export async function getPublicOccupiedDates(unitId: string, from: Date, to: Date) {
  const blocks = await getUnitOccupiedRanges(unitId, from, to);
  return blocks.map((b) => ({ date: b.date, endDate: b.endDate, type: b.type }));
}
