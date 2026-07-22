import { prisma } from "@/lib/prisma";
import { isBookingCompleted } from "@/lib/bookingStatus";

export { isBookingCompleted };

/** Monthly Elite Booker Challenge tiers — company-wide, limited reward slots.
 * Shared as-is by Housekeeping staff too: several employees do both jobs, so
 * their booking activity is real booker activity and competes for the same
 * slots/rewards, not a separate scaled-down copy. */
export const ELITE_TIERS = [
  { tier: 50, amount: 500, slots: 2, stars: 1, badge: "Bronze Booker", medal: "🥉" },
  { tier: 100, amount: 1500, slots: 2, stars: 2, badge: "Silver Booker", medal: "🥈" },
  { tier: 150, amount: 2500, slots: 2, stars: 3, badge: "Gold Booker", medal: "🥇" },
  { tier: 200, amount: 3500, slots: 1, stars: 4, badge: "Platinum Booker", medal: "💎" },
  { tier: 250, amount: 5000, slots: 1, stars: 5, badge: "Legend Booker", medal: "👑" },
] as const;

/** Roles eligible for the Elite Booker Challenge — anyone who can be
 * assigned as a booking's booker, regardless of their primary role. */
export const ELITE_CHALLENGE_ROLES = ["BOOKER", "HOUSEKEEPING"] as const;

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
  const bookers = await prisma.employee.findMany({ where: { role: { in: [...ELITE_CHALLENGE_ROLES] }, active: true }, select: { id: true } });
  if (bookers.length === 0) return;

  // cancelledAt: null — a cancelled booking never counts toward crossing a
  // tier threshold. Awards already persisted before a booking's later
  // cancellation are untouched (see the "paid once" guarantee above); this
  // only affects which bookings are eligible to cross a threshold going
  // forward.
  const bookings = await prisma.booking.findMany({
    where: { bookerId: { in: bookers.map((b) => b.id) }, cancelledAt: null },
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
