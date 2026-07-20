import { prisma } from "@/lib/prisma";

/** Monthly Elite Booker Challenge tiers — company-wide, limited reward slots. */
export const ELITE_TIERS = [
  { tier: 50, amount: 500, slots: 2, stars: 1, badge: "Bronze Booker", medal: "🥉" },
  { tier: 100, amount: 1500, slots: 2, stars: 2, badge: "Silver Booker", medal: "🥈" },
  { tier: 150, amount: 2500, slots: 2, stars: 3, badge: "Gold Booker", medal: "🥇" },
  { tier: 200, amount: 3500, slots: 1, stars: 4, badge: "Platinum Booker", medal: "💎" },
  { tier: 250, amount: 5000, slots: 1, stars: 5, badge: "Legend Booker", medal: "👑" },
] as const;

/** Monthly Elite Housekeeper Challenge tiers — same shape/rewards/slots as
 * ELITE_TIERS above, but the metric is distinct cleaning days this month
 * instead of completed bookings (250 bookings/month is reachable for a
 * high-volume booker; 250 distinct days obviously isn't for a cleaner, so
 * the thresholds are scaled to what a housekeeping schedule can actually hit). */
export const HOUSEKEEPER_TIERS = [
  { tier: 5, amount: 500, slots: 2, stars: 1, badge: "Bronze Housekeeper", medal: "🥉" },
  { tier: 10, amount: 1500, slots: 2, stars: 2, badge: "Silver Housekeeper", medal: "🥈" },
  { tier: 15, amount: 2500, slots: 2, stars: 3, badge: "Gold Housekeeper", medal: "🥇" },
  { tier: 20, amount: 3500, slots: 1, stars: 4, badge: "Platinum Housekeeper", medal: "💎" },
  { tier: 25, amount: 5000, slots: 1, stars: 5, badge: "Legend Housekeeper", medal: "👑" },
] as const;

const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** A booking counts toward commission/gamification once its stay has actually finished. */
export function isBookingCompleted(booking: { date: Date | string; checkOutDate: Date | string | null }, now: Date = new Date()): boolean {
  const end = booking.checkOutDate ? new Date(booking.checkOutDate) : new Date(booking.date);
  return end.getTime() <= now.getTime();
}

/**
 * Ensures every tier that's been legitimately reached this month has its
 * limited slots correctly filled by whoever crossed the threshold earliest
 * (booking-completion timestamp as tiebreaker) — company-wide, not per
 * unit. Idempotent and safe to call on every read: an award, once
 * persisted, is never revoked or reassigned by a later recompute (the
 * unique employee+month+tier constraint plus a no-op update means a slot
 * winner stays the winner even if new data would technically produce a
 * different ranking) — "paid once" is a hard guarantee, not just a display
 * convention.
 */
export async function syncEliteBookerAwards() {
  const now = new Date();
  const bookers = await prisma.employee.findMany({ where: { role: "BOOKER", active: true }, select: { id: true } });
  if (bookers.length === 0) return;

  const bookings = await prisma.booking.findMany({
    where: { bookerId: { in: bookers.map((b) => b.id) } },
    select: { bookerId: true, date: true, checkOutDate: true },
  });

  // Group each booker's completed bookings by calendar month (keyed off
  // check-in date, matching the rest of the app's monthly-bucket
  // convention), sorted by completion timestamp ascending.
  const byEmployeeMonth = new Map<string, { completedAt: Date }[]>();
  for (const b of bookings) {
    if (!b.bookerId || !isBookingCompleted(b, now)) continue;
    const completedAt = b.checkOutDate ?? b.date;
    const d = b.date;
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = `${b.bookerId}::${monthKey}`;
    if (!byEmployeeMonth.has(key)) byEmployeeMonth.set(key, []);
    byEmployeeMonth.get(key)!.push({ completedAt: new Date(completedAt) });
  }
  for (const list of byEmployeeMonth.values()) list.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  const monthKeys = new Set([...byEmployeeMonth.keys()].map((k) => k.split("::")[1]));
  for (const monthKey of monthKeys) {
    const [y, m] = monthKey.split("-").map(Number);
    const month = new Date(Date.UTC(y, m - 1, 1));
    for (const t of ELITE_TIERS) {
      const crossings: { employeeId: string; completedAt: Date }[] = [];
      for (const [key, list] of byEmployeeMonth) {
        const [empId, mk] = key.split("::");
        if (mk !== monthKey || list.length < t.tier) continue;
        crossings.push({ employeeId: empId, completedAt: list[t.tier - 1].completedAt });
      }
      crossings.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
      const winners = crossings.slice(0, t.slots);
      for (let i = 0; i < winners.length; i++) {
        const w = winners[i];
        await prisma.eliteBookerAward.upsert({
          where: { employeeId_month_tier: { employeeId: w.employeeId, month, tier: t.tier } },
          update: {},
          create: { employeeId: w.employeeId, month, tier: t.tier, amount: t.amount, slotRank: i + 1, completedAt: w.completedAt },
        });
      }
    }
  }
}

/**
 * Same idempotent slot-award sync as syncEliteBookerAwards, but for the
 * Housekeeper Challenge: the metric is distinct cleaning days this month
 * (Asia/Manila calendar day, matching every other cleaning-day count in the
 * app), and the tiebreaker for who "reached" a tier first is the timestamp
 * of that day's earliest logged cleaning session.
 */
export async function syncEliteCleanerAwards() {
  const cleaners = await prisma.employee.findMany({ where: { role: "HOUSEKEEPING", active: true }, select: { id: true } });
  if (cleaners.length === 0) return;

  const logs = await prisma.cleaningLog.findMany({
    where: { employeeId: { in: cleaners.map((c) => c.id) } },
    select: { employeeId: true, startedAt: true },
  });

  // For each employee+month, the earliest log timestamp on each distinct day.
  const byEmployeeMonth = new Map<string, Map<string, Date>>();
  for (const log of logs) {
    if (!log.employeeId) continue;
    const day = dayOf(log.startedAt);
    const monthKey = day.slice(0, 7);
    const key = `${log.employeeId}::${monthKey}`;
    if (!byEmployeeMonth.has(key)) byEmployeeMonth.set(key, new Map());
    const dayMap = byEmployeeMonth.get(key)!;
    const existing = dayMap.get(day);
    if (!existing || log.startedAt.getTime() < existing.getTime()) dayMap.set(day, log.startedAt);
  }

  // Sorted (ascending) list of distinct-day completion timestamps per employee+month.
  const distinctDaysByKey = new Map<string, Date[]>();
  for (const [key, dayMap] of byEmployeeMonth) {
    distinctDaysByKey.set(key, [...dayMap.values()].sort((a, b) => a.getTime() - b.getTime()));
  }

  const monthKeys = new Set([...distinctDaysByKey.keys()].map((k) => k.split("::")[1]));
  for (const monthKey of monthKeys) {
    const [y, m] = monthKey.split("-").map(Number);
    const month = new Date(Date.UTC(y, m - 1, 1));
    for (const t of HOUSEKEEPER_TIERS) {
      const crossings: { employeeId: string; completedAt: Date }[] = [];
      for (const [key, times] of distinctDaysByKey) {
        const [empId, mk] = key.split("::");
        if (mk !== monthKey || times.length < t.tier) continue;
        crossings.push({ employeeId: empId, completedAt: times[t.tier - 1] });
      }
      crossings.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
      const winners = crossings.slice(0, t.slots);
      for (let i = 0; i < winners.length; i++) {
        const w = winners[i];
        await prisma.eliteCleanerAward.upsert({
          where: { employeeId_month_tier: { employeeId: w.employeeId, month, tier: t.tier } },
          update: {},
          create: { employeeId: w.employeeId, month, tier: t.tier, amount: t.amount, slotRank: i + 1, completedAt: w.completedAt },
        });
      }
    }
  }
}
