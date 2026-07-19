import { prisma } from "@/lib/prisma";

/** Completed-booking milestone tiers for the per-unit, per-month booker bonus. */
export const BONUS_TIERS = [
  { tier: 50, amount: 3000 },
  { tier: 60, amount: 10000 },
] as const;

/** A booking counts toward commission/gamification once its stay has actually finished. */
export function isBookingCompleted(booking: { date: Date | string; checkOutDate: Date | string | null }, now: Date = new Date()): boolean {
  const end = booking.checkOutDate ? new Date(booking.checkOutDate) : new Date(booking.date);
  return end.getTime() <= now.getTime();
}

/**
 * Ensures every booker+unit+calendar-month combo that has crossed the 50/60
 * completed-booking threshold has its bonus award persisted. Idempotent —
 * the unique (employeeId, unitId, month, tier) constraint means calling
 * this repeatedly (e.g. on every My Earnings / admin payroll page load)
 * never double-awards, so there's no separate "recalculate" trigger needed
 * for booking edits/cancellations to be picked up correctly.
 */
export async function syncBookerBonusAwards(employeeId?: string) {
  const now = new Date();
  const bookers = await prisma.employee.findMany({
    where: { role: "BOOKER", active: true, ...(employeeId ? { id: employeeId } : {}) },
    select: { id: true },
  });
  if (bookers.length === 0) return;

  const bookings = await prisma.booking.findMany({
    where: { bookerId: { in: bookers.map((b) => b.id) } },
    select: { bookerId: true, unitId: true, date: true, checkOutDate: true },
  });

  // Group completed bookings by bookerId::unitId::YYYY-MM, keyed off each
  // booking's check-in date (the month it was logged against).
  const counts = new Map<string, number>();
  for (const b of bookings) {
    if (!b.bookerId || !isBookingCompleted(b, now)) continue;
    const d = new Date(b.date);
    const key = `${b.bookerId}::${b.unitId}::${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of counts) {
    const [empId, unitId, ym] = key.split("::");
    const [y, m] = ym.split("-").map(Number);
    const month = new Date(Date.UTC(y, m - 1, 1));
    for (const { tier, amount } of BONUS_TIERS) {
      if (count < tier) continue;
      await prisma.bookerBonusAward.upsert({
        where: { employeeId_unitId_month_tier: { employeeId: empId, unitId, month, tier } },
        update: {},
        create: { employeeId: empId, unitId, month, tier, amount },
      });
    }
  }
}
