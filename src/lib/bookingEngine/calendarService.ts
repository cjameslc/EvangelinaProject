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

/**
 * Same as getPublicOccupiedDates but for every given unit in one query —
 * used by the AI assistant context, which is rebuilt on every chat message
 * and previously issued one query per unit (N+1 on a hot path).
 */
export async function getPublicOccupiedDatesForUnits(unitIds: string[], from: Date, to: Date) {
  const blocks = await prisma.calendarBlock.findMany({
    where: { unitId: { in: unitIds }, date: { lt: to }, OR: [{ endDate: null }, { endDate: { gt: from } }] },
    select: { unitId: true, date: true, endDate: true, type: true },
    orderBy: { date: "asc" },
  });
  const byUnit = new Map<string, { date: Date; endDate: Date | null; type: string }[]>();
  for (const b of blocks) {
    const entry = { date: b.date, endDate: b.endDate, type: b.type };
    const list = byUnit.get(b.unitId);
    if (list) list.push(entry);
    else byUnit.set(b.unitId, [entry]);
  }
  return unitIds.map((unitId) => ({ unitId, blocks: byUnit.get(unitId) ?? [] }));
}
